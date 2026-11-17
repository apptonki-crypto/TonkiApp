/**
 * End-to-end check of the Soroban client against a real network (use testnet).
 *
 *   npm run chain:smoke
 *
 * Needs STELLAR_DEPLOYER_SECRET_KEY (funded), DYNAMIC_WASM_HASH (uploaded),
 * DYNAMICS_HASH_SECRET and the STELLAR_* network settings. It deploys one throwaway
 * contract, exercises every function the app uses and prints the fee of each call, which
 * is the measurement needed to size the signer's balance. It never touches the database.
 */
import { randomUUID } from "node:crypto";

import { readChainConfig } from "src/lib/posts/chain/config";
import { SorobanDynamicChain } from "src/lib/posts/chain/sorobanChain";
import { stroopsToXlm } from "src/lib/posts/chain/costs";

type Step = { name: string; fee: bigint | null; detail: string };
const steps: Step[] = [];

function record(name: string, tx: { feeStroops: bigint | null }, detail: string) {
  steps.push({ name, fee: tx.feeStroops, detail });
  const fee = tx.feeStroops === null ? "?" : `${stroopsToXlm(tx.feeStroops)} XLM`;
  console.log(`${name.padEnd(28)} ${detail.padEnd(22)} fee ${fee}`);
}

function expectEqual<T>(label: string, actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`${label}: se esperaba ${String(expected)} y llegó ${String(actual)}`);
  }
}

async function main() {
  const config = readChainConfig();
  if (config.network === "mainnet") {
    throw new Error("El smoke test no se ejecuta en mainnet.");
  }
  const chain = new SorobanDynamicChain(config);
  console.log(`Red: ${config.network}  RPC: ${config.rpcUrl}`);
  console.log(`Saldo inicial: ${await chain.signerBalanceXlm()} XLM\n`);

  const now = Math.floor(Date.now() / 1000);
  const source = {
    dynamic_id: randomUUID(),
    kind: "going" as const,
    config: { text: "smoke" },
    goal_count: 2,
    starts_at: null,
    ends_at: new Date((now + 3600) * 1000),
    establishment_id: null,
    token: null,
  };

  const deployed = await chain.deploy(source);
  const contractId = deployed.value.contractId;
  expectEqual("contractIdFor", contractId, chain.contractIdFor(source));
  record("deploy + constructor", deployed, contractId.slice(0, 12) + "…");

  const again = await chain.deploy(source);
  expectEqual("deploy idempotente", again.value.contractId, contractId);
  expectEqual("deploy idempotente sin tx", again.txHash, "");

  const user1 = randomUUID();
  const user2 = randomUUID();
  const user3 = randomUUID();

  const first = await chain.participate(contractId, user1);
  expectEqual("participate #1", first.value, "recorded");
  record("participate", first, first.value);

  const dup = await chain.participate(contractId, user1);
  expectEqual("participate duplicado", dup.value, "already_recorded");
  record("participate (duplicado)", dup, dup.value);

  let state = await chain.readState(contractId);
  expectEqual("progreso tras #1", state.progressCount, 1);

  const second = await chain.participate(contractId, user2);
  expectEqual("participate #2", second.value, "recorded");
  state = await chain.readState(contractId);
  expectEqual("estado al llegar a la meta", state.status, "exhausted");
  expectEqual("progreso al cierre", state.progressCount, 2);

  const late = await chain.participate(contractId, user3);
  expectEqual("participate tras cierre", late.value, "exhausted");
  record("participate (agotada)", late, late.value);

  const imported = await chain.importBatch(contractId, {
    participantUserIds: [user3],
    charges: [],
  });
  record("importBatch (cerrada)", imported, `progress=${imported.value}`);

  const closed = await chain.close(contractId);
  record("close", closed, closed.value);

  const bumped = await chain.bump(contractId);
  record("bump", bumped, "ok");

  console.log(`\nLedger actual: ${await chain.latestLedger()}`);
  console.log(`Saldo final:   ${await chain.signerBalanceXlm()} XLM`);

  const paid = steps.filter((s) => s.fee !== null);
  const total = paid.reduce((sum, s) => sum + (s.fee ?? BigInt(0)), BigInt(0));
  console.log(`Total comisiones medidas: ${stroopsToXlm(total)} XLM en ${paid.length} tx`);
  console.log("\nOK: el cliente Soroban cumple el contrato de DynamicChain.");
}

main().catch((error) => {
  console.error("\nFALLÓ:", error instanceof Error ? error.message : error);
  process.exit(1);
});
