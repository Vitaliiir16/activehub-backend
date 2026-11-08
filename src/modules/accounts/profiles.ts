import type { PoolClient } from "pg";
import type { Actor } from "./security";
import { HttpError, invalid } from "./http";

export async function dictionaries(
  client: PoolClient,
  cityId: string | undefined,
  directionIds: string[] | undefined,
  currentId?: string,
) {
  if (cityId) {
    const result = await client.query(
      "SELECT id FROM cities WHERE id=$1 AND (is_active OR id=(SELECT city_id FROM user_profiles WHERE account_id=$2 UNION ALL SELECT city_id FROM organizer_profiles WHERE account_id=$2 LIMIT 1)) FOR SHARE",
      [cityId, currentId ?? null],
    );
    if (!result.rowCount) invalid("cityId", "Choose an active city");
  }
  if (directionIds) {
    const result = await client.query(
      "SELECT id FROM directions WHERE id=ANY($1::uuid[]) AND (is_active OR id IN (SELECT direction_id FROM profile_directions WHERE account_id=$2)) FOR SHARE",
      [directionIds, currentId ?? null],
    );
    if (result.rowCount !== directionIds.length)
      invalid(
        "directionIds",
        "Choose active directions; existing inactive selections may be retained",
      );
  }
}
export async function setDirections(
  client: PoolClient,
  accountId: string,
  ids: string[],
) {
  await client.query("DELETE FROM profile_directions WHERE account_id=$1", [
    accountId,
  ]);
  if (ids.length)
    await client.query(
      "INSERT INTO profile_directions (account_id,direction_id) SELECT $1,unnest($2::uuid[])",
      [accountId, ids],
    );
}
export async function ownedImage(
  client: PoolClient,
  accountId: string,
  id?: string | null,
) {
  if (
    id &&
    !(
      await client.query(
        "SELECT id FROM profile_images WHERE id=$1 AND owner_id=$2",
        [id, accountId],
      )
    ).rowCount
  )
    throw new HttpError(404, "NOT_FOUND", "Image not found");
}
export async function profile(
  client: PoolClient,
  current: Pick<Actor, "id" | "role">,
) {
  const account = (
    await client.query(
      "SELECT id,email,created_at,updated_at FROM accounts WHERE id=$1",
      [current.id],
    )
  ).rows[0];
  const base = {
    id: account.id,
    email: account.email,
    role: current.role,
    createdAt: account.created_at,
    updatedAt: account.updated_at,
  };
  if (current.role === "ADMIN") {
    const admin = (
      await client.query(
        "SELECT display_name FROM admin_profiles WHERE account_id=$1",
        [current.id],
      )
    ).rows[0];
    return { ...base, displayName: admin.display_name };
  }
  const table =
    current.role === "USER" ? "user_profiles" : "organizer_profiles";
  const row = (
    await client.query(
      `SELECT p.*,json_build_object('id',c.id,'name',c.name,'isActive',c.is_active) AS city FROM ${table} p JOIN cities c ON c.id=p.city_id WHERE p.account_id=$1`,
      [current.id],
    )
  ).rows[0];
  const directions = (
    await client.query(
      'SELECT d.id,d.name,d.is_active AS "isActive" FROM directions d JOIN profile_directions p ON p.direction_id=d.id WHERE p.account_id=$1 ORDER BY d.name',
      [current.id],
    )
  ).rows;
  if (current.role === "USER")
    return {
      ...base,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      city: row.city,
      gender: row.gender,
      photoUrl: row.photo_id ? `/api/media/${row.photo_id}` : null,
      preferredDirectionIds: directions.map((d) => d.id),
      loyaltyLevel: "STANDARD",
      cardLockedByAdmin: false,
      pointsBalance: 0,
      lifetimePoints: 0,
    };
  return {
    ...base,
    name: row.name,
    type: row.type,
    phone: row.phone,
    city: row.city,
    description: row.description,
    directions,
    logoUrl: row.logo_id ? `/api/media/${row.logo_id}` : null,
  };
}
