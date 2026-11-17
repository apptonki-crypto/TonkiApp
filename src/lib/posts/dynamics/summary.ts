import { isChainRequiredButUnavailable } from "src/lib/posts/chain/authority";
import { contractExplorerUrl } from "src/lib/posts/chain/config";
import type { DynamicPhase, DynamicStatus } from "src/lib/posts/dynamics/constants";
import {
  closeTransition,
  readPromoCode,
  readPublicConfig,
  type DynamicRecord,
} from "src/lib/posts/dynamics/rules";

export type PublicDynamicSummary = {
  dynamic_id: string;
  post_id: string;
  kind: DynamicRecord["kind"];
  status: DynamicStatus;
  phase: DynamicPhase;
  text: string;
  progress_count: number;
  progress_amount: string;
  goal_count: number | null;
  goal_amount: string | null;
  goal_mode: "count" | "amount" | null;
  starts_at: string | null;
  ends_at: string | null;
  closed_at: string | null;
  min_ticket: string | null;
  product_ids: string[];
  viewer_participated: boolean;
  /** legacy | pending | active | failed. Pending/failed mean the contract is not live. */
  chain_status: string;
  /** True when the contract is required but not live yet, so nobody can participate. */
  awaiting_chain: boolean;
};

/** Public summary plus the promo code and contract link. Only for the post author. */
export type AuthorDynamicSummary = PublicDynamicSummary & {
  code?: string;
  contract_id?: string;
  contract_url?: string;
  deploy_tx_hash?: string;
};

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function toPublicDynamicSummary(
  dynamic: DynamicRecord,
  options?: { viewerParticipated?: boolean; now?: Date }
): PublicDynamicSummary {
  const now = options?.now ?? new Date();
  const next = closeTransition(dynamic, now);
  const status: DynamicStatus = next ?? dynamic.status;
  const closedAt = next ? (dynamic.closed_at ?? now) : dynamic.closed_at;
  let phase: DynamicPhase;
  if (status === "exhausted") phase = "exhausted";
  else if (status === "expired") phase = "expired";
  else if (dynamic.starts_at && now.getTime() < dynamic.starts_at.getTime()) {
    phase = "upcoming";
  } else phase = "active";

  const pub = readPublicConfig(dynamic);
  return {
    dynamic_id: dynamic.dynamic_id,
    post_id: dynamic.post_id,
    kind: dynamic.kind,
    status,
    phase,
    text: pub.text,
    progress_count: dynamic.progress_count,
    progress_amount: dynamic.progress_amount.toFixed(2),
    goal_count: dynamic.goal_count,
    goal_amount: pub.goal_amount,
    goal_mode: pub.goal_mode,
    starts_at: iso(dynamic.starts_at),
    ends_at: iso(dynamic.ends_at),
    closed_at: iso(closedAt),
    min_ticket: pub.min_ticket,
    product_ids: pub.product_ids,
    viewer_participated: options?.viewerParticipated ?? false,
    chain_status: dynamic.chain_status ?? "legacy",
    awaiting_chain: isChainRequiredButUnavailable(dynamic),
  };
}

/**
 * Same fields as the public summary, plus `code` on promo-code dynamics.
 * The QR token stays out of the payload.
 */
export function toAuthorDynamicSummary(
  dynamic: DynamicRecord,
  options?: { viewerParticipated?: boolean; now?: Date }
): AuthorDynamicSummary {
  const summary: AuthorDynamicSummary = toPublicDynamicSummary(dynamic, options);
  if (dynamic.kind === "promo_code") {
    const code = readPromoCode(dynamic.config);
    if (code) summary.code = code;
  }
  if (dynamic.contract_id) {
    summary.contract_id = dynamic.contract_id;
    summary.contract_url = contractExplorerUrl(dynamic.contract_id);
    if (dynamic.deploy_tx_hash) summary.deploy_tx_hash = dynamic.deploy_tx_hash;
  }
  return summary;
}
