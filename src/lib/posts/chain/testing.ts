import { createHash } from "crypto";

import {
  chargeHash,
  participantHash,
  toContractConfig,
  type ContractConfigInput,
  type DynamicChainSource,
} from "src/lib/posts/chain/hashes";
import {
  ChainTransactionError,
  type ChainContractStatus,
  type ChainOutcome,
  type ChainState,
  type ChainTx,
  type DynamicChain,
  type ImportBatchInput,
} from "src/lib/posts/chain/types";

type Contract = {
  config: ContractConfigInput;
  status: ChainContractStatus;
  progressCount: number;
  progressAmount: bigint;
  closedAt: bigint;
  participants: Set<string>;
  charges: Set<string>;
};

const ZERO = BigInt(0);

/**
 * In-memory stand-in for the Soroban contract. It follows the same rules as
 * contracts/contracts/tonki-dynamic/src/lib.rs so flows can be tested without a network.
 * The contract itself is covered by `cargo test`.
 */
export class FakeDynamicChain implements DynamicChain {
  readonly contracts = new Map<string, Contract>();
  readonly calls: Array<{ method: string; args: unknown[] }> = [];
  /** Seconds since epoch. Tests move it to simulate time passing. */
  nowSeconds = 1_800_000_000;
  /** Throw this from the next call(s) of the named method. */
  failNext = new Map<string, { error: ChainTransactionError; times: number }>();
  balanceXlm = 1_000;
  private txCounter = 0;
  private ledger = 1_000;
  private readonly secret = "fake-secret";

  failWith(method: string, error: ChainTransactionError, times = 1): void {
    this.failNext.set(method, { error, times });
  }

  contractIdFor(source: DynamicChainSource): string {
    const config = toContractConfig(source, this.secret);
    const digest = createHash("sha256")
      .update(`${source.dynamic_id}:${config.configHash.toString("hex")}`)
      .digest("hex")
      .toUpperCase();
    // Not a valid strkey, but unique and shaped like one for assertions.
    return `C${digest.slice(0, 55).replace(/[0189]/g, "A")}`;
  }

  private record(method: string, ...args: unknown[]): void {
    this.calls.push({ method, args });
    const pending = this.failNext.get(method);
    if (pending && pending.times > 0) {
      pending.times -= 1;
      throw pending.error;
    }
  }

  private tx<T>(value: T): ChainTx<T> {
    this.txCounter += 1;
    this.ledger += 1;
    return {
      value,
      txHash: this.txCounter.toString(16).padStart(64, "0"),
      feeStroops: BigInt(100_000),
      ledger: this.ledger,
    };
  }

  private get(contractId: string): Contract {
    const contract = this.contracts.get(contractId);
    if (!contract) throw new ChainTransactionError("Contrato inexistente", false);
    return contract;
  }

  private goalMet(c: Contract): boolean {
    const cfg = c.config;
    switch (cfg.kind) {
      case "time_promo":
        return false;
      case "going":
      case "qr":
        return cfg.goalCount > 0 && c.progressCount >= cfg.goalCount;
      case "promo_code":
        return c.progressCount >= (cfg.goalCount === 0 ? 1 : cfg.goalCount);
      case "consumption":
        return cfg.goalAmount > ZERO
          ? c.progressAmount >= cfg.goalAmount
          : cfg.goalCount > 0 && c.progressCount >= cfg.goalCount;
    }
  }

  private applyClose(c: Contract): void {
    if (c.status !== "active") return;
    const now = BigInt(this.nowSeconds);
    if (this.goalMet(c)) {
      c.status = "exhausted";
      c.closedAt = now;
    } else if (c.config.endsAt > ZERO && now > c.config.endsAt) {
      c.status = "expired";
      c.closedAt = now;
    }
  }

  private guard(c: Contract, allowed: string[]): ChainOutcome | null {
    if (!allowed.includes(c.config.kind)) return "wrong_kind";
    if (c.status === "exhausted") return "exhausted";
    if (c.status === "expired") return "expired";
    if (c.config.startsAt > ZERO && BigInt(this.nowSeconds) < c.config.startsAt) {
      return "upcoming";
    }
    return null;
  }

  async deploy(source: DynamicChainSource) {
    this.record("deploy", source);
    const contractId = this.contractIdFor(source);
    if (!this.contracts.has(contractId)) {
      this.contracts.set(contractId, {
        config: toContractConfig(source, this.secret),
        status: "active",
        progressCount: 0,
        progressAmount: ZERO,
        closedAt: ZERO,
        participants: new Set(),
        charges: new Set(),
      });
      return this.tx({ contractId });
    }
    return { value: { contractId }, txHash: "", feeStroops: null, ledger: null };
  }

  async participate(contractId: string, userId: string) {
    this.record("participate", contractId, userId);
    const c = this.get(contractId);
    this.applyClose(c);
    const blocked = this.guard(c, ["going", "promo_code", "qr"]);
    if (blocked) return this.tx(blocked);
    const key = participantHash(userId).toString("hex");
    if (c.participants.has(key)) return this.tx<ChainOutcome>("already_recorded");
    c.participants.add(key);
    c.progressCount += 1;
    this.applyClose(c);
    return this.tx<ChainOutcome>("recorded");
  }

  async applyConsumption(contractId: string, chargeId: string, amountCentavos: bigint) {
    this.record("applyConsumption", contractId, chargeId, amountCentavos);
    if (amountCentavos <= ZERO) {
      throw new ChainTransactionError("Monto inválido", false);
    }
    const c = this.get(contractId);
    this.applyClose(c);
    const blocked = this.guard(c, ["consumption"]);
    if (blocked) return this.tx(blocked);
    if (c.config.minTicket > ZERO && amountCentavos < c.config.minTicket) {
      return this.tx<ChainOutcome>("below_min_ticket");
    }
    const key = chargeHash(chargeId).toString("hex");
    if (c.charges.has(key)) return this.tx<ChainOutcome>("already_recorded");
    c.charges.add(key);
    c.progressCount += 1;
    c.progressAmount += amountCentavos;
    this.applyClose(c);
    return this.tx<ChainOutcome>("recorded");
  }

  async close(contractId: string) {
    this.record("close", contractId);
    const c = this.get(contractId);
    if (c.status === "active") {
      c.status = "exhausted";
      c.closedAt = BigInt(this.nowSeconds);
    }
    return this.tx<ChainContractStatus>(c.status);
  }

  async evaluate(contractId: string) {
    this.record("evaluate", contractId);
    const c = this.get(contractId);
    this.applyClose(c);
    return this.tx<ChainContractStatus>(c.status);
  }

  async importBatch(contractId: string, input: ImportBatchInput) {
    this.record("importBatch", contractId, input);
    const c = this.get(contractId);
    for (const userId of input.participantUserIds) {
      const key = participantHash(userId).toString("hex");
      if (!c.participants.has(key)) {
        c.participants.add(key);
        c.progressCount += 1;
      }
    }
    for (const charge of input.charges) {
      const key = chargeHash(charge.chargeId).toString("hex");
      if (!c.charges.has(key)) {
        c.charges.add(key);
        c.progressCount += 1;
        c.progressAmount += charge.amountCentavos;
      }
    }
    return this.tx(c.progressCount);
  }

  async bump(contractId: string): Promise<ChainTx<null>> {
    this.record("bump", contractId);
    this.get(contractId);
    return this.tx(null);
  }

  async readState(contractId: string): Promise<ChainState> {
    this.record("readState", contractId);
    const c = this.get(contractId);
    return {
      admin: "GFAKE",
      kind: c.config.kind,
      goalCount: c.config.goalCount,
      goalAmount: c.config.goalAmount,
      minTicket: c.config.minTicket,
      startsAt: c.config.startsAt,
      endsAt: c.config.endsAt,
      configHash: c.config.configHash.toString("hex"),
      status: c.status,
      progressCount: c.progressCount,
      progressAmount: c.progressAmount,
      closedAt: c.closedAt,
    };
  }

  async signerBalanceXlm(): Promise<number> {
    this.record("signerBalanceXlm");
    return this.balanceXlm;
  }

  async latestLedger(): Promise<number> {
    return this.ledger;
  }
}
