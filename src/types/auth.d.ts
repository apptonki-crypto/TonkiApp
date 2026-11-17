export type UserRole = "admin" | "user" | "staff";

export interface PublicUser {
  id: string;
  email: string | null;
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
  /** Empresa que aún debe llenar su perfil público (alta obligatoria, una vez). */
  requiresBusinessProfile?: boolean;
}

/** Wrapped by `apiSuccess`: `{ success: true, user, role }` */
export interface AuthMePayload {
  user: PublicUser;
  role: UserRole;
}
