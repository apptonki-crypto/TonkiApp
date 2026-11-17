/**
 * Gives a Soroban contract to the dynamics that were created before the integration.
 *
 *   npm run chain:migrate                      dry run (writes nothing)
 *   npm run chain:migrate -- --apply           migrate for real
 *   npm run chain:migrate -- --apply --kind going --limit 20
 *   npm run chain:migrate -- --dynamic <uuid> --apply
 *
 * Requires DYNAMICS_CHAIN_MODE=shadow|on and the chain settings in the environment.
 * It touches whatever database DATABASE_URL points to: check it before using --apply.
 */
import { DYNAMIC_KINDS } from "src/lib/posts/dynamics/constants";
import { migrateLegacyDynamics } from "src/lib/posts/chain/migrateLegacy";

function readArgs(argv: string[]) {
  const args = {
    apply: false,
    limit: undefined as number | undefined,
    kinds: [] as string[],
    dynamicId: undefined as string | undefined,
    batchSize: undefined as number | undefined,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`Falta el valor de ${arg}`);
      i += 1;
      return value;
    };
    if (arg === "--") continue;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--limit") args.limit = Number(next());
    else if (arg === "--batch-size") args.batchSize = Number(next());
    else if (arg === "--dynamic") args.dynamicId = next();
    else if (arg === "--kind") {
      const kind = next();
      if (!(DYNAMIC_KINDS as readonly string[]).includes(kind)) {
        throw new Error(`Tipo desconocido: ${kind}. Opciones: ${DYNAMIC_KINDS.join(", ")}`);
      }
      args.kinds.push(kind);
    } else throw new Error(`Argumento desconocido: ${arg}`);
  }
  for (const [name, value] of [
    ["--limit", args.limit],
    ["--batch-size", args.batchSize],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
      throw new Error(`${name} debe ser un entero positivo`);
    }
  }
  return args;
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const report = await migrateLegacyDynamics({
    dryRun: !args.apply,
    limit: args.limit,
    kinds: args.kinds,
    dynamicId: args.dynamicId,
    batchSize: args.batchSize,
    log: args.json ? undefined : (line) => console.log(line),
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const xlm = Number(BigInt(report.fee_stroops)) / 10_000_000;
    console.log(
      `\n${report.dryRun ? "[simulación] " : ""}modo=${report.mode} candidatas=${report.candidates} ` +
        `migradas=${report.migrated} omitidas=${report.skipped} fallidas=${report.failed} comisiones=${xlm} XLM`
    );
    if (report.dryRun) console.log("Nada se escribió. Usa --apply para migrar.");
    for (const entry of report.entries.filter((e) => e.progress_warning)) {
      console.log(`aviso ${entry.dynamic_id}: ${entry.progress_warning}`);
    }
  }
  if (report.failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
