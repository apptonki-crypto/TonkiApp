import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Operation,
  StrKey,
  TransactionBuilder,
  hash,
  rpc,
  scValToNative,
  xdr,
  type Transaction,
} from "@stellar/stellar-sdk";
import { createHash } from "crypto";

import {
  decodeOutcome,
  decodeState,
  decodeStatus,
  decodeU32,
  encodeAddress,
  encodeBytes32,
  encodeBytesVec,
  encodeChargeEntries,
  encodeConfig,
  encodeI128,
} from "src/lib/posts/chain/codec";
import type { ChainConfig } from "src/lib/posts/chain/config";
import {
  chargeHash,
  participantHash,
  toContractConfig,
  type DynamicChainSource,
} from "src/lib/posts/chain/hashes";
import {
  ChainTransactionError,
  type ChainTx,
  type DynamicChain,
} from "src/lib/posts/chain/types";

const POLL_ATTEMPTS = 30;
const MAX_SEND_RETRIES = 3;
const STROOPS_PER_XLM = 10_000_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Contract rejections (`Error(Contract, #n)`) and host failures will not fix themselves. */
function simulationFailure(message: string): ChainTransactionError {
  const contractReject = /Error\(Contract, #\d+\)/.test(message);
  return new ChainTransactionError(
    `La simulación falló: ${message}`,
    !contractReject && !/HostError/.test(message)
  );
}

function feeFromResult(resultXdr: xdr.TransactionResult | undefined): bigint | null {
  if (!resultXdr) return null;
  try {
    return BigInt(resultXdr.feeCharged().toString());
  } catch {
    return null;
  }
}

/** Deterministic instance salt: same dynamic and same config always map to the same address. */
export function deploySalt(source: DynamicChainSource, configHashHex: string): Buffer {
  return createHash("sha256")
    .update(`tonki:dynamic-salt:${source.dynamic_id}:${configHashHex}`)
    .digest();
}

export function deriveContractId(
  deployer: string,
  salt: Buffer,
  networkPassphrase: string
): string {
  const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
    new xdr.HashIdPreimageContractId({
      networkId: hash(Buffer.from(networkPassphrase)),
      contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
        new xdr.ContractIdPreimageFromAddress({
          address: new Address(deployer).toScAddress(),
          salt,
        })
      ),
    })
  );
  return StrKey.encodeContract(hash(preimage.toXDR()));
}

export class SorobanDynamicChain implements DynamicChain {
  private readonly server: rpc.Server;
  private readonly keypair: Keypair;
  /** One signer means one sequence number: submit transactions one at a time per process. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly config: ChainConfig) {
    this.server = new rpc.Server(config.rpcUrl, {
      allowHttp: config.rpcUrl.startsWith("http://"),
    });
    this.keypair = Keypair.fromSecret(config.deployerSecret);
  }

  get signerPublicKey(): string {
    return this.keypair.publicKey();
  }

  contractIdFor(source: DynamicChainSource): string {
    const contract = toContractConfig(source, this.config.hashSecret);
    const salt = deploySalt(source, contract.configHash.toString("hex"));
    return deriveContractId(
      this.keypair.publicKey(),
      salt,
      this.config.networkPassphrase
    );
  }

  async deploy(
    source: DynamicChainSource
  ): Promise<ChainTx<{ contractId: string }>> {
    const contractId = this.contractIdFor(source);

    // A retry after a crash between send and DB write finds the instance already live.
    const existing = await this.tryReadState(contractId);
    if (existing) {
      return {
        value: { contractId },
        txHash: "",
        feeStroops: null,
        ledger: null,
      };
    }

    const contract = toContractConfig(source, this.config.hashSecret);
    const salt = deploySalt(source, contract.configHash.toString("hex"));
    const operation = Operation.createCustomContract({
      address: new Address(this.keypair.publicKey()),
      wasmHash: Buffer.from(this.config.wasmHash, "hex"),
      salt,
      constructorArgs: [
        encodeAddress(this.keypair.publicKey()),
        encodeConfig(contract),
      ],
    });

    const tx = await this.submit(operation);
    const returned = tx.returnValue ? String(scValToNative(tx.returnValue)) : contractId;
    if (returned !== contractId) {
      throw new ChainTransactionError(
        `El contrato desplegado (${returned}) no coincide con el esperado (${contractId})`,
        false,
        tx.txHash
      );
    }
    return {
      value: { contractId },
      txHash: tx.txHash,
      feeStroops: tx.feeStroops,
      ledger: tx.ledger,
    };
  }

  async participate(contractId: string, userId: string) {
    const tx = await this.invoke(contractId, "participate", [
      encodeBytes32(participantHash(userId)),
    ]);
    return this.mapValue(tx, decodeOutcome);
  }

  async applyConsumption(
    contractId: string,
    chargeId: string,
    amountCentavos: bigint
  ) {
    const tx = await this.invoke(contractId, "apply_consumption", [
      encodeBytes32(chargeHash(chargeId)),
      encodeI128(amountCentavos),
    ]);
    return this.mapValue(tx, decodeOutcome);
  }

  async close(contractId: string) {
    const tx = await this.invoke(contractId, "close", []);
    return this.mapValue(tx, decodeStatus);
  }

  async evaluate(contractId: string) {
    const tx = await this.invoke(contractId, "evaluate", []);
    return this.mapValue(tx, decodeStatus);
  }

  async importBatch(
    contractId: string,
    input: Parameters<DynamicChain["importBatch"]>[1]
  ) {
    const tx = await this.invoke(contractId, "import_batch", [
      encodeBytesVec(input.participantUserIds.map(participantHash)),
      encodeChargeEntries(
        input.charges.map((charge) => ({
          hash: chargeHash(charge.chargeId),
          amount: charge.amountCentavos,
        }))
      ),
    ]);
    return this.mapValue(tx, decodeU32);
  }

  async bump(contractId: string): Promise<ChainTx<null>> {
    const tx = await this.invoke(contractId, "bump", []);
    return { value: null, txHash: tx.txHash, feeStroops: tx.feeStroops, ledger: tx.ledger };
  }

  async readState(contractId: string) {
    const tx = new TransactionBuilder(await this.freshAccount(), {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(new Contract(contractId).call("get_state"))
      .setTimeout(30)
      .build();
    const sim = await this.simulate(tx);
    if (!sim.result) {
      throw new ChainTransactionError("get_state no devolvió resultado", true);
    }
    return decodeState(sim.result.retval);
  }

  async signerBalanceXlm(): Promise<number> {
    const entry = await this.server.getAccountEntry(this.keypair.publicKey());
    return Number(entry.balance().toString()) / STROOPS_PER_XLM;
  }

  async latestLedger(): Promise<number> {
    const latest = await this.server.getLatestLedger();
    return latest.sequence;
  }

  // ---- internals ----

  private async tryReadState(contractId: string) {
    try {
      return await this.readState(contractId);
    } catch {
      return null;
    }
  }

  private async freshAccount() {
    try {
      return await this.server.getAccount(this.keypair.publicKey());
    } catch (error) {
      throw new ChainTransactionError(
        `No se pudo leer la cuenta firmante: ${messageOf(error)}`,
        true
      );
    }
  }

  private async simulate(tx: Transaction) {
    let sim: rpc.Api.SimulateTransactionResponse;
    try {
      sim = await this.server.simulateTransaction(tx);
    } catch (error) {
      throw new ChainTransactionError(
        `RPC no disponible: ${messageOf(error)}`,
        true
      );
    }
    if (rpc.Api.isSimulationError(sim)) throw simulationFailure(sim.error);
    return sim as rpc.Api.SimulateTransactionSuccessResponse;
  }

  private mapValue<T>(
    tx: SubmittedTx,
    decode: (value: xdr.ScVal) => T
  ): ChainTx<T> {
    if (!tx.returnValue) {
      throw new ChainTransactionError(
        "La transacción no devolvió valor",
        false,
        tx.txHash
      );
    }
    return {
      value: decode(tx.returnValue),
      txHash: tx.txHash,
      feeStroops: tx.feeStroops,
      ledger: tx.ledger,
    };
  }

  private invoke(
    contractId: string,
    method: string,
    args: xdr.ScVal[]
  ): Promise<SubmittedTx> {
    return this.submit(new Contract(contractId).call(method, ...args));
  }

  /** Serializes submissions so concurrent requests do not reuse a sequence number. */
  private submit(operation: xdr.Operation): Promise<SubmittedTx> {
    const run = this.queue.then(() => this.submitWithRetry(operation));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async submitWithRetry(operation: xdr.Operation): Promise<SubmittedTx> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_SEND_RETRIES; attempt += 1) {
      try {
        return await this.submitOnce(operation);
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof ChainTransactionError &&
          error.retryable &&
          error.message.includes("txBAD_SEQ");
        if (!retryable) throw error;
        await sleep(500 * (attempt + 1));
      }
    }
    throw lastError;
  }

  private async submitOnce(operation: xdr.Operation): Promise<SubmittedTx> {
    const built = new TransactionBuilder(await this.freshAccount(), {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(60)
      .build();

    const sim = await this.simulate(built);
    const prepared = rpc.assembleTransaction(built, sim).build();
    prepared.sign(this.keypair);

    let sent: rpc.Api.SendTransactionResponse;
    try {
      sent = await this.server.sendTransaction(prepared);
    } catch (error) {
      throw new ChainTransactionError(
        `No se pudo enviar la transacción: ${messageOf(error)}`,
        true
      );
    }
    if (sent.status === "ERROR") {
      const code = sent.errorResult?.result().switch().name ?? "desconocido";
      const badSeq = code === "txBadSeq";
      throw new ChainTransactionError(
        `La red rechazó la transacción (${badSeq ? "txBAD_SEQ" : code})`,
        badSeq || code === "txInsufficientFee",
        sent.hash
      );
    }
    if (sent.status === "TRY_AGAIN_LATER") {
      throw new ChainTransactionError("La red pidió reintentar más tarde", true, sent.hash);
    }

    let result: rpc.Api.GetTransactionResponse;
    try {
      result = await this.server.pollTransaction(sent.hash, {
        attempts: POLL_ATTEMPTS,
        sleepStrategy: rpc.LinearSleepStrategy,
      });
    } catch (error) {
      throw new ChainTransactionError(
        `Sin confirmación todavía (${messageOf(error)}). Revisa la tx antes de reintentar.`,
        true,
        sent.hash
      );
    }
    if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new ChainTransactionError(
        `La transacción no tuvo éxito (${result.status})`,
        false,
        sent.hash
      );
    }
    return {
      txHash: sent.hash,
      returnValue: result.returnValue,
      feeStroops: feeFromResult(result.resultXdr),
      ledger: result.ledger ?? null,
    };
  }
}

type SubmittedTx = {
  txHash: string;
  returnValue: xdr.ScVal | undefined;
  feeStroops: bigint | null;
  ledger: number | null;
};
