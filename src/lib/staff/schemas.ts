import { z } from "zod";

import { STAFF_INVITE_TOKEN_PATTERN } from "src/lib/staff/constants";

export const staffInviteRedeemSchema = z.object({
  token: z.string().regex(STAFF_INVITE_TOKEN_PATTERN, "Invitación inválida"),
});

export const staffIdSchema = z.string().uuid("Mesero inválido");
export const staffInviteIdSchema = z.string().uuid("Invitación inválida");
