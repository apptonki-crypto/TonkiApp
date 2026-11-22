export type TonkisCredit = {
  charge_id: string;
  establishment_name: string;
  points: number;
  credited_at: string;
};

export type TonkisRedemptionMovement = {
  id: string;
  establishment_name: string;
  title: string;
  points: number;
  status: "pending" | "delivered";
  at: string;
};
