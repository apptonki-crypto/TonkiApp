export type CreatedCharge = {
  token: string;
  path: string;
  url: string;
  qr_image: string;
  amount: string;
  cashback_percent: number;
  points: number;
  expires_at: string;
};

export type PaymentIntent = {
  destination: string;
  memo: string;
  network: "testnet" | "mainnet";
  asset:
    | { type: "native" }
    | {
        type: "credit_alphanum4" | "credit_alphanum12";
        code: string;
        issuer: string;
      };
  asset_code: string;
  /** Decimal string, Stellar precision. */
  amount: string;
  rate_mxn: string;
  expires_at: string;
};

export type ChargePreview = {
  establishment_id: string;
  establishment_name: string;
  establishment_avatar_url: string | null;
  amount: string;
  cashback_percent: number;
  points: number;
  status: string;
  expires_at: string;
  expired: boolean;
  /** True when this customer can start (or resume) paying. */
  can_claim: boolean;
  block_reason: string | null;
  /** awaiting | confirmed | null. */
  pay_status: string | null;
  /** The viewer already started paying this charge. */
  payer_is_viewer: boolean;
  /** The business has a wallet that can receive the payment. */
  business_wallet_ready: boolean;
  /** Pollar ramp order the viewer opened to load pesos; null for anyone else. */
  ramp_order_id: string | null;
  ramp_order_state: string | null;
};
