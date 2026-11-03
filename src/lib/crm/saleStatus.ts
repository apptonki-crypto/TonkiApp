import {
  CHARGE_STATUS_CREDITED,
  CHARGE_STATUS_PENDING,
} from "src/lib/charges/constants";
import type { CrmStatusFilter } from "src/lib/crm/types";

export function crmSaleStatusLabel(status: string): string {
  if (status === CHARGE_STATUS_CREDITED) return "Confirmada";
  if (status === CHARGE_STATUS_PENDING) return "Pendiente";
  return status;
}

export const CRM_STATUS_FILTER_LABEL: Record<CrmStatusFilter, string> = {
  credited: "Confirmadas",
  pending: "Pendientes",
  all: "Todas",
};
