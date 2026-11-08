// ActiveHub dictionary administration: add, rename and deactivate cities and directions without breaking references.
import { z } from "zod";
import { jsonBody } from "../accounts/http";
import { access, conflict, missing, page } from "../marketplace/core";
import { pagination } from "../marketplace/validation";
import { audit } from "./audit";

type Kind = "cities" | "directions";
const table = (kind: Kind) => (kind === "cities" ? "cities" : "directions");
const label = (kind: Kind) => (kind === "cities" ? "city" : "direction");
const target = (kind: Kind) => (kind === "cities" ? ("CITY" as const) : ("DIRECTION" as const));
const dto = (r: { id: string; name: string; is_active: boolean }) => ({ id: r.id, name: r.name, isActive: r.is_active });
const code = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `item-${Date.now()}`;
const name = z.string().trim().min(2).max(100);
const query = z.strictObject({
  ...pagination,
  isActive: z.enum(["true", "false"]).optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
});
const create = z.strictObject({ name, isActive: z.boolean().default(true) });
const edit = z
  .strictObject({ name: name.optional(), isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "Change at least one field");

export function listDictionaryAdmin(request: Request, kind: Kind) {
  const q = query.parse(Object.fromEntries(new URL(request.url).searchParams));
  return access(
    request,
    async (client) => {
      const values: unknown[] = [];
      const where = q.isActive ? (values.push(q.isActive === "true"), "WHERE is_active=$1") : "";
      const total = Number((await client.query(`SELECT count(*) FROM ${table(kind)} ${where}`, values)).rows[0].count);
      values.push(q.pageSize, (q.page - 1) * q.pageSize);
      const rows = (
        await client.query(
          `SELECT id,name,is_active FROM ${table(kind)} ${where} ORDER BY created_at ${q.sort === "newest" ? "DESC" : "ASC"},name,id LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        )
      ).rows;
      return Response.json(page(rows.map(dto), total, q.page, q.pageSize));
    },
    ["ADMIN"],
  );
}

export async function createDictionaryItem(request: Request, kind: Kind) {
  const input = create.parse(await jsonBody(request));
  return access(
    request,
    async (client, admin) => {
      // Names and codes are unique; a duplicate returns a conflict from the database constraint.
      const row = (
        await client.query(
          `INSERT INTO ${table(kind)}(code,name,is_active) VALUES($1,$2,$3) RETURNING id,name,is_active`,
          [code(input.name), input.name, input.isActive],
        )
      ).rows[0];
      await audit(client, admin.id, `${target(kind)}_CREATE`, target(kind), row.id, null, { name: row.name });
      return Response.json(dto(row), { status: 201 });
    },
    ["ADMIN"],
    true,
  );
}

export async function editDictionaryItem(request: Request, kind: Kind, id: string) {
  z.uuid().parse(id);
  const input = edit.parse(await jsonBody(request));
  return access(
    request,
    async (client, admin) => {
      // One lock serializes edits so two administrators cannot deactivate the last active value together.
      await client.query("SELECT pg_advisory_xact_lock(42817,$1)", [kind === "cities" ? 5 : 6]);
      const old = (
        await client.query(`SELECT id,name,is_active FROM ${table(kind)} WHERE id=$1 FOR UPDATE`, [id])
      ).rows[0];
      if (!old) missing(`${label(kind)[0].toUpperCase()}${label(kind).slice(1)} not found`);
      const isActive = input.isActive ?? old.is_active;
      if (
        old.is_active &&
        !isActive &&
        !(await client.query(`SELECT 1 FROM ${table(kind)} WHERE is_active AND id<>$1 LIMIT 1`, [id])).rowCount
      )
        conflict(`Keep at least one active ${label(kind)}`);
      const row = (
        await client.query(
          `UPDATE ${table(kind)} SET name=$2,is_active=$3,updated_at=now() WHERE id=$1 RETURNING id,name,is_active`,
          [id, input.name ?? old.name, isActive],
        )
      ).rows[0];
      await audit(client, admin.id, `${target(kind)}_${old.is_active && !isActive ? "DEACTIVATE" : !old.is_active && isActive ? "ACTIVATE" : "RENAME"}`, target(kind), id, null, {
        from: old.name,
        to: row.name,
      });
      return Response.json(dto(row));
    },
    ["ADMIN"],
    true,
  );
}
