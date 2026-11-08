// ActiveHub administration audit trail: an append-only record of every administrator decision and its reason.
import type { PoolClient } from "pg";

export type AuditTarget = "USER" | "ORGANIZER" | "EVENT" | "BOOKING" | "PLAN" | "CITY" | "DIRECTION";

export async function audit(
  client: PoolClient,
  adminId: string,
  action: string,
  target: AuditTarget,
  targetId: string,
  reason: string | null,
  details: Record<string, unknown> = {},
) {
  return (
    await client.query<{ id: string }>(
      "INSERT INTO admin_audit_log(admin_id,action,target_type,target_id,reason,details) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
      [adminId, action, target, targetId, reason, JSON.stringify(details)],
    )
  ).rows[0].id;
}
