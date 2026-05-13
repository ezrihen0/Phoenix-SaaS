/**
 * Gate 10 — telephony/messaging tenant isolation.
 * recent_calls has no organization_id; ownership is derived from owned DIDs and matched CRM rows.
 */

import { apiError } from "../common/api-response";
import type { ActorContext } from "../common/request-types";

export const TELEPHONY_ORG_QUERY_PARAM = "telephonyOrgId";

export function requireTelephonyOrganizationId(actor: ActorContext | undefined): string {
  const id = actor?.organization_id?.trim();
  if (!id) {
    apiError(400, "organization_context_missing", "An active organization is required for this action.");
  }
  return id;
}

/** WHERE predicate: a recent_calls row (alias) belongs to the given Phoenix organization (positional `?`). */
export function recentCallBelongsToOrgSql(alias: string): string {
  return `(
    (${alias}.inbound_owned_phone_number_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM owned_phone_numbers opn_rc
      WHERE BINARY opn_rc.id = BINARY ${alias}.inbound_owned_phone_number_id AND opn_rc.tenant_id = ?
    ))
    OR (${alias}.matched_client_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM customers cust_rc
      WHERE BINARY cust_rc.id = BINARY ${alias}.matched_client_id AND cust_rc.organization_id = ?
    ))
    OR (${alias}.matched_lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM leads lead_rc
      WHERE BINARY lead_rc.id = BINARY ${alias}.matched_lead_id AND lead_rc.organization_id = ?
    ))
  )`;
}

/** Three positional parameters (same organization id). */
export function recentCallBelongsToOrgParams(organizationId: string): [string, string, string] {
  const id = organizationId.trim();
  return [id, id, id];
}

/**
 * WHERE predicate: a recent_call_sms_logs row belongs to the org via customer or parent recent_call.
 * Uses positional `?` — see {@link smsLogBelongsToOrgParams}.
 */
export function smsLogBelongsToOrgSql(logAlias: string, recentCallAlias: string): string {
  return `(
    (${logAlias}.customer_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM customers cust_sl
      WHERE BINARY cust_sl.id = BINARY ${logAlias}.customer_id AND cust_sl.organization_id = ?
    ))
    OR (${logAlias}.recent_call_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM recent_calls ${recentCallAlias}
      WHERE BINARY ${recentCallAlias}.id = BINARY ${logAlias}.recent_call_id
        AND ${recentCallBelongsToOrgSql(recentCallAlias)}
    ))
  )`;
}

/** Params: org (customer branch) + three for nested recent_call predicate. */
export function smsLogBelongsToOrgParams(organizationId: string): [string, string, string, string] {
  const id = organizationId.trim();
  return [id, id, id, id];
}

/** TypeORM named parameter variant (single bind key repeated in SQL). */
export function recentCallBelongsToOrgSqlNamed(alias: string, paramName: string): string {
  return `(
    (${alias}.inbound_owned_phone_number_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM owned_phone_numbers opn_rc
      WHERE BINARY opn_rc.id = BINARY ${alias}.inbound_owned_phone_number_id AND opn_rc.tenant_id = :${paramName}
    ))
    OR (${alias}.matched_client_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM customers cust_rc
      WHERE BINARY cust_rc.id = BINARY ${alias}.matched_client_id AND cust_rc.organization_id = :${paramName}
    ))
    OR (${alias}.matched_lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM leads lead_rc
      WHERE BINARY lead_rc.id = BINARY ${alias}.matched_lead_id AND lead_rc.organization_id = :${paramName}
    ))
  )`;
}
