export type UserRole = "admin" | "user";

export interface PublicUser {
  id: string;
  email: string | null;
  username: string | null;
  name: string | null;
  first_name: string | null;
  paternal_surname: string | null;
  maternal_surname: string | null;
  birth_date: string | null;
  wallet_address: string | null;
  avatar_url: string | null;
}

export interface AuthResponse {
  message: string;
  user: PublicUser;
  role: UserRole;
  redirectTo: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface WalletLoginRequest {
  publicKey: string;
  signature: string;
}

/** Returned when Freighter signature is valid but the wallet is not registered yet. */
export interface WalletNeedsRegistrationResponse {
  needsRegistration: true;
  publicKey: string;
  message: string;
}

export interface WalletRegisterRequest {
  email: string;
  birthDate: string;
  name?: string;
}

/** Wrapped by `apiSuccess`: `{ success: true, user, role }` */
export interface AuthMePayload {
  user: PublicUser;
  role: UserRole;
}
