export type PollarNetwork = "testnet" | "mainnet";

/** Client-safe. Only `NEXT_PUBLIC_` variables — never the secret key. */
export function readPollarPublishableKey(): string | null {
  const key = process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY?.trim();
  return key ? key : null;
}

export function readPollarNetwork(): PollarNetwork {
  const raw = process.env.NEXT_PUBLIC_POLLAR_NETWORK?.trim().toLowerCase();
  return raw === "mainnet" ? "mainnet" : "testnet";
}
