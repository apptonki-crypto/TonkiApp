import { fetchSessionJson, type SessionFetchResult } from "src/lib/api/fetchSessionJson";
import type { CrmProduct } from "src/lib/crm/types";
import type {
  CreatedStaffInvite,
  StaffContext,
  StaffInviteView,
  StaffMemberView,
  StaffShiftCharge,
} from "src/lib/staff/types";

export type StaffShiftChargeWithQr = StaffShiftCharge & { qr_image: string | null };
export type CreatedStaffInviteWithQr = CreatedStaffInvite & { qr_image: string };

function successObject(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null) return null;
  const o = body as Record<string, unknown>;
  return o.success === true ? o : null;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/* ---- Mesero ---- */

export function fetchStaffContext(): Promise<
  SessionFetchResult<{ context: StaffContext; products: CrmProduct[] }>
> {
  return fetchSessionJson("/api/staff/context", {
    networkErrorMessage: "No se pudo cargar el negocio",
    parse: (body) => {
      const o = successObject(body);
      if (!o || typeof o.context !== "object" || !Array.isArray(o.products)) return null;
      return { context: o.context as StaffContext, products: o.products as CrmProduct[] };
    },
  });
}

export function fetchStaffShiftCharges(): Promise<SessionFetchResult<StaffShiftChargeWithQr[]>> {
  return fetchSessionJson("/api/staff/charges", {
    networkErrorMessage: "No se pudieron cargar tus códigos",
    parse: (body) => {
      const o = successObject(body);
      return o && Array.isArray(o.charges) ? (o.charges as StaffShiftChargeWithQr[]) : null;
    },
  });
}

export function previewStaffInviteClient(
  token: string
): Promise<SessionFetchResult<{ establishment_name: string }>> {
  return fetchSessionJson("/api/staff/invites/preview", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ token }),
    networkErrorMessage: "No se pudo revisar la invitación",
    parse: (body) => {
      const o = successObject(body);
      return o && typeof o.establishment_name === "string"
        ? { establishment_name: o.establishment_name }
        : null;
    },
  });
}

export function redeemStaffInviteClient(
  token: string
): Promise<SessionFetchResult<{ redirectTo: string }>> {
  return fetchSessionJson("/api/staff/invites/redeem", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ token }),
    networkErrorMessage: "No se pudo aceptar la invitación",
    parse: (body) => {
      const o = successObject(body);
      return o && typeof o.redirectTo === "string" ? { redirectTo: o.redirectTo } : null;
    },
  });
}

/* ---- Negocio ---- */

export function fetchAdminStaff(): Promise<
  SessionFetchResult<{ members: StaffMemberView[]; invites: StaffInviteView[] }>
> {
  return fetchSessionJson("/api/admin/staff", {
    networkErrorMessage: "No se pudieron cargar los meseros",
    parse: (body) => {
      const o = successObject(body);
      if (!o || !Array.isArray(o.members) || !Array.isArray(o.invites)) return null;
      return {
        members: o.members as StaffMemberView[],
        invites: o.invites as StaffInviteView[],
      };
    },
  });
}

export function createAdminStaffInvite(): Promise<SessionFetchResult<CreatedStaffInviteWithQr>> {
  return fetchSessionJson("/api/admin/staff", {
    method: "POST",
    networkErrorMessage: "No se pudo crear la invitación",
    parse: (body) => {
      const o = successObject(body);
      return o && typeof o.invite === "object" && o.invite !== null
        ? (o.invite as CreatedStaffInviteWithQr)
        : null;
    },
  });
}

function deleteRequest(url: string, networkErrorMessage: string) {
  return fetchSessionJson<true>(url, {
    method: "DELETE",
    networkErrorMessage,
    parse: (body) => (successObject(body) ? true : null),
  });
}

export function revokeAdminStaff(staffId: string) {
  return deleteRequest(
    `/api/admin/staff/${encodeURIComponent(staffId)}`,
    "No se pudo dar de baja al mesero"
  );
}

export function revokeAdminStaffInvite(inviteId: string) {
  return deleteRequest(
    `/api/admin/staff/invites/${encodeURIComponent(inviteId)}`,
    "No se pudo cancelar la invitación"
  );
}
