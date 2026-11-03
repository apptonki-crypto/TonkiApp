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

export type ChargePreview = {
  establishment_name: string;
  establishment_avatar_url: string | null;
  amount: string;
  cashback_percent: number;
  points: number;
  status: string;
  expires_at: string;
  expired: boolean;
  can_claim: boolean;
  block_reason: string | null;
};
