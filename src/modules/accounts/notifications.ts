import { z } from "zod";
import { HttpError } from "./http";
import { protectedAction } from "./service";
import { pageInput } from "./validation";

export function listNotifications(request: Request) {
  const query = pageInput
    .extend({ unreadOnly: z.enum(["true", "false"]).optional() })
    .parse(Object.fromEntries(new URL(request.url).searchParams));
  return protectedAction(request, async (client, current) => {
    const unread = query.unreadOnly === "true";
    const total = Number(
      (
        await client.query(
          "SELECT count(*) FROM notifications WHERE account_id=$1 AND (NOT $2 OR read_at IS NULL)",
          [current.id, unread],
        )
      ).rows[0].count,
    );
    const rows = (
      await client.query(
        `SELECT id,type,category,title,body,link,read_at AS "readAt",email_status AS "emailStatus",created_at AS "createdAt",updated_at AS "updatedAt" FROM notifications WHERE account_id=$1 AND (NOT $2 OR read_at IS NULL) ORDER BY created_at ${query.sort === "newest" ? "DESC" : "ASC"},id LIMIT $3 OFFSET $4`,
        [current.id, unread, query.pageSize, (query.page - 1) * query.pageSize],
      )
    ).rows;
    return Response.json({
      items: rows,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    });
  });
}
export function readNotification(request: Request, id?: string) {
  if (id) z.uuid().parse(id);
  return protectedAction(
    request,
    async (client, current) => {
      if (
        id &&
        !(
          await client.query(
            "SELECT id FROM notifications WHERE id=$1 AND account_id=$2",
            [id, current.id],
          )
        ).rowCount
      )
        throw new HttpError(404, "NOT_FOUND", "Notification not found");
      const updated = await client.query(
        "UPDATE notifications SET read_at=now(),updated_at=now() WHERE account_id=$1 AND read_at IS NULL AND ($2::uuid IS NULL OR id=$2)",
        [current.id, id ?? null],
      );
      const count = Number(
        (
          await client.query(
            "SELECT count(*) FROM notifications WHERE account_id=$1 AND read_at IS NULL",
            [current.id],
          )
        ).rows[0].count,
      );
      return Response.json({
        updatedCount: updated.rowCount,
        unreadCount: count,
      });
    },
    undefined,
    true,
  );
}
