export type StaffMemberView = {
  staff_id: string;
  user_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type StaffInviteView = {
  invite_id: string;
  expires_at: string;
  created_at: string;
};

export type CreatedStaffInvite = StaffInviteView & {
  /** Solo se devuelve al crearla; en BD queda el hash. */
  url: string;
};

export type StaffShiftCharge = {
  token: string;
  url: string;
  amount: string;
  points: number;
  /** pending | credited | expired */
  status: "pending" | "credited" | "expired";
  expires_at: string;
  created_at: string;
};

export type StaffContext = {
  establishment_name: string;
  cashback_percent: number;
  staff_name: string;
};
