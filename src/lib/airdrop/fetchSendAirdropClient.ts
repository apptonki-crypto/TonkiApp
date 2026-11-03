import { fetchSessionJson } from "src/lib/api/fetchSessionJson";
import type { AirdropAssetCode } from "src/lib/airdrop/constants";

export type PrepareAirdropSuccess = {
  unsigned_xdr: string;
  network_passphrase: string;
  source_public_key: string;
  total_amount: number;
  users_involved: number;
  asset: AirdropAssetCode;
  fees: {
    user_pool: number;
    app_fee: number;
    stellar_reserve: number;
    app_fee_destination: string;
  };
};

export type SendAirdropSuccess = {
  message: string;
  log_id: string;
  transaction_hash: string;
  horizon_url: string;
  source_public_key: string;
  total_amount: number;
  users_involved: number;
  asset: AirdropAssetCode;
  fees: {
    user_pool: number;
    app_fee: number;
    stellar_reserve: number;
    app_fee_destination: string;
  };
};

export type PrepareAirdropResult =
  | { ok: true; data: PrepareAirdropSuccess }
  | { ok: false; error: string; unauthorized?: true };

export type SendAirdropResult =
  | { ok: true; data: SendAirdropSuccess }
  | { ok: false; error: string; unauthorized?: true };

export async function prepareAdminAirdrop(opts: {
  sourcePublicKey: string;
}): Promise<PrepareAirdropResult> {
  return fetchSessionJson("/api/admin/airdrop/prepare", {
    networkErrorMessage: "No se pudo preparar el airdrop",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_public_key: opts.sourcePublicKey,
    }),
    invalidFormatMessage: "Formato de preparación inesperado",
    parse: (body) => {
      const data = body as Partial<PrepareAirdropSuccess>;
      if (!data.unsigned_xdr || !data.network_passphrase) return null;
      return {
        unsigned_xdr: data.unsigned_xdr,
        network_passphrase: data.network_passphrase,
        source_public_key: data.source_public_key as string,
        total_amount: data.total_amount as number,
        users_involved: data.users_involved as number,
        fees: data.fees as PrepareAirdropSuccess["fees"],
        asset: data.asset as AirdropAssetCode,
      };
    },
  });
}

export async function sendAdminAirdrop(opts: {
  signedXdr: string;
  sourcePublicKey?: string;
}): Promise<SendAirdropResult> {
  return fetchSessionJson("/api/admin/airdrop/send", {
    networkErrorMessage: "No se pudo enviar el airdrop",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      signed_xdr: opts.signedXdr,
      ...(opts.sourcePublicKey
        ? { source_public_key: opts.sourcePublicKey }
        : {}),
    }),
    invalidFormatMessage: "Formato de respuesta inesperado",
    parse: (body) => {
      const data = body as Partial<SendAirdropSuccess>;
      if (!data.transaction_hash || !data.horizon_url) return null;
      return {
        message: data.message ?? "Transacción enviada con éxito",
        log_id: data.log_id as string,
        transaction_hash: data.transaction_hash,
        horizon_url: data.horizon_url,
        source_public_key: data.source_public_key as string,
        total_amount: data.total_amount as number,
        users_involved: data.users_involved as number,
        fees: data.fees as SendAirdropSuccess["fees"],
        asset: data.asset as AirdropAssetCode,
      };
    },
  });
}
