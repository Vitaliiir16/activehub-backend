// ActiveHub chat: one conversation per user-organizer pair, ordered text messages, read state and unread counts.
import { z } from "zod";
import type { PoolClient } from "pg";
import { HttpError, invalid, jsonBody } from "../accounts/http";
import type { Actor } from "../accounts/security";
import { access, conflict, idempotent, missing, notify, page } from "../marketplace/core";
import { pagination } from "../marketplace/validation";

type ConversationRow = {
  id: string;
  user_id: string;
  organizer_id: string;
  last_seq: number;
  last_message_at: Date | null;
  created_at: Date;
  updated_at: Date;
};
type MessageRow = {
  id: string;
  conversation_id: string;
  seq: number;
  sender_id: string;
  body: string;
  event_id: string | null;
  event_title: string | null;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
};
const roles = ["USER", "ORGANIZER"] as const;
const previewLength = 140;
const messagesPerMinute = 30;

const unreadSql = `(SELECT count(*)::int FROM messages m WHERE m.conversation_id=c.id AND m.sender_id<>$1 AND m.read_at IS NULL)`;
const conversationSql = `SELECT c.*,
  CASE WHEN c.user_id=$1 THEN op.name ELSE up.first_name||' '||up.last_name END AS counterpart_name,
  ${unreadSql} AS unread,
  (SELECT left(m.body,${previewLength}) FROM messages m WHERE m.conversation_id=c.id ORDER BY m.seq DESC LIMIT 1) AS last_text
  FROM conversations c JOIN user_profiles up ON up.account_id=c.user_id JOIN organizer_profiles op ON op.account_id=c.organizer_id`;
type ConversationView = ConversationRow & {
  counterpart_name: string;
  unread: number;
  last_text: string | null;
};
const conversationDto = (c: ConversationView) => ({
  id: c.id,
  createdAt: c.created_at,
  updatedAt: c.updated_at,
  userId: c.user_id,
  organizerId: c.organizer_id,
  lastMessageAt: c.last_message_at,
  unreadCount: c.unread,
  counterpartName: c.counterpart_name,
  lastMessageText: c.last_text,
});
const messageDto = (m: MessageRow) => ({
  id: m.id,
  createdAt: m.created_at,
  updatedAt: m.updated_at,
  conversationId: m.conversation_id,
  senderId: m.sender_id,
  text: m.body,
  eventId: m.event_id,
  eventTitle: m.event_title,
  readAt: m.read_at,
});
const messageSql = `SELECT m.*,e.title AS event_title FROM messages m LEFT JOIN events e ON e.id=m.event_id`;

async function unreadTotal(client: PoolClient, accountId: string) {
  return Number(
    (
      await client.query(
        "SELECT count(*) FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE (c.user_id=$1 OR c.organizer_id=$1) AND m.sender_id<>$1 AND m.read_at IS NULL",
        [accountId],
      )
    ).rows[0].count,
  );
}
async function view(client: PoolClient, id: string, accountId: string) {
  return (
    await client.query<ConversationView>(`${conversationSql} WHERE c.id=$2`, [accountId, id])
  ).rows[0];
}
/** Locks a conversation the caller takes part in; other identifiers look like missing records. */
async function participant(client: PoolClient, id: string, current: Actor, lock = false) {
  z.uuid().parse(id);
  const row = (
    await client.query<ConversationRow>(
      `SELECT * FROM conversations WHERE id=$1 AND (user_id=$2 OR organizer_id=$2)${lock ? " FOR UPDATE" : ""}`,
      [id, current.id],
    )
  ).rows[0];
  if (!row) missing("Conversation not found");
  return row;
}
async function active(client: PoolClient, id: string, role: string) {
  return !!(
    await client.query("SELECT 1 FROM accounts WHERE id=$1 AND role=$2 AND status='ACTIVE'", [id, role])
  ).rowCount;
}

const listQuery = z.strictObject({
  ...pagination,
  sort: z.enum(["lastMessageDesc", "lastMessageAsc"]).default("lastMessageDesc"),
});
export function listConversations(request: Request) {
  const q = listQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  return access(
    request,
    async (client, current) => {
      const total = Number(
        (
          await client.query(
            "SELECT count(*) FROM conversations WHERE user_id=$1 OR organizer_id=$1",
            [current.id],
          )
        ).rows[0].count,
      );
      const order = q.sort === "lastMessageDesc" ? "c.last_message_at DESC NULLS LAST,c.created_at DESC" : "c.last_message_at ASC NULLS FIRST,c.created_at ASC";
      const rows = (
        await client.query<ConversationView>(
          `${conversationSql} WHERE c.user_id=$1 OR c.organizer_id=$1 ORDER BY ${order},c.id LIMIT $2 OFFSET $3`,
          [current.id, q.pageSize, (q.page - 1) * q.pageSize],
        )
      ).rows;
      return Response.json({
        ...page(rows.map(conversationDto), total, q.page, q.pageSize),
        unreadTotal: await unreadTotal(client, current.id),
      });
    },
    [...roles],
  );
}

const createInput = z.strictObject({
  organizerId: z.uuid().optional(),
  userId: z.uuid().optional(),
  eventId: z.uuid().optional(),
  bookingId: z.uuid().optional(),
});
export async function createConversation(request: Request) {
  const input = createInput.parse(await jsonBody(request));
  return access(
    request,
    async (client, current) =>
      idempotent(client, current, request, "createConversation", input, async () => {
        let userId: string;
        let organizerId: string;
        if (current.role === "USER") {
          if (input.userId || input.bookingId)
            invalid("userId", "Users start conversations with an organizer or an event");
          let target = input.organizerId;
          if (input.eventId) {
            const event = (
              await client.query(
                "SELECT organizer_id FROM events WHERE id=$1 AND status<>'DELETED'",
                [input.eventId],
              )
            ).rows[0];
            if (!event) missing("Event not found");
            if (target && target !== event.organizer_id)
              invalid("organizerId", "The organizer does not own this event");
            target = event.organizer_id;
          }
          if (!target) invalid("organizerId", "Choose an organizer or an event");
          userId = current.id;
          organizerId = target;
        } else {
          if (input.organizerId)
            invalid("organizerId", "Organizers start conversations from a booking");
          const booking = input.bookingId
            ? (
                await client.query(
                  "SELECT b.user_id FROM bookings b JOIN event_sessions s ON s.id=b.session_id JOIN events e ON e.id=s.event_id WHERE b.id=$1 AND e.organizer_id=$2",
                  [input.bookingId, current.id],
                )
              ).rows[0]
            : input.userId
              ? (
                  await client.query(
                    "SELECT b.user_id FROM bookings b JOIN event_sessions s ON s.id=b.session_id JOIN events e ON e.id=s.event_id WHERE b.user_id=$1 AND e.organizer_id=$2 LIMIT 1",
                    [input.userId, current.id],
                  )
                ).rows[0]
              : invalid("bookingId", "Choose a booking to start the conversation from");
          if (!booking) missing("Booking not found");
          userId = booking.user_id;
          organizerId = current.id;
        }
        let row = (
          await client.query<ConversationRow>(
            "SELECT * FROM conversations WHERE user_id=$1 AND organizer_id=$2",
            [userId, organizerId],
          )
        ).rows[0];
        let status = 200;
        if (!row) {
          const counterpart = current.role === "USER" ? organizerId : userId;
          if (!(await active(client, counterpart, current.role === "USER" ? "ORGANIZER" : "USER")))
            conflict("This account cannot receive messages");
          row = (
            await client.query<ConversationRow>(
              "INSERT INTO conversations(user_id,organizer_id) VALUES($1,$2) ON CONFLICT(user_id,organizer_id) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING *",
              [userId, organizerId],
            )
          ).rows[0];
          status = 201;
        }
        return { status, body: conversationDto((await view(client, row.id, current.id))!) };
      }),
    [...roles],
    true,
  );
}

const messagesQuery = z.strictObject({
  ...pagination,
  afterId: z.uuid().optional(),
  sort: z.enum(["oldest", "newest"]).default("oldest"),
});
export function listMessages(request: Request, id: string) {
  const q = messagesQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  return access(
    request,
    async (client, current) => {
      await participant(client, id, current);
      const values: unknown[] = [id];
      let after = "";
      if (q.afterId) {
        const known = (
          await client.query("SELECT seq FROM messages WHERE id=$1 AND conversation_id=$2", [q.afterId, id])
        ).rows[0];
        if (!known) missing("Message not found");
        values.push(known.seq);
        after = " AND m.seq>$2";
      }
      const total = Number(
        (
          await client.query(
            `SELECT count(*) FROM messages m WHERE m.conversation_id=$1${after}`,
            values,
          )
        ).rows[0].count,
      );
      const direction = q.afterId || q.sort === "oldest" ? "ASC" : "DESC";
      values.push(q.pageSize, q.afterId ? 0 : (q.page - 1) * q.pageSize);
      const rows = (
        await client.query<MessageRow>(
          `${messageSql} WHERE m.conversation_id=$1${after} ORDER BY m.seq ${direction} LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        )
      ).rows;
      return Response.json(page(rows.map(messageDto), total, q.page, q.pageSize));
    },
    [...roles],
  );
}

const messageInput = z.strictObject({
  text: z.string().trim().min(1).max(2000),
  eventId: z.uuid().optional(),
});
export async function sendMessage(request: Request, id: string) {
  const input = messageInput.parse(await jsonBody(request));
  return access(
    request,
    async (client, current) =>
      idempotent(client, current, request, `sendMessage:${id}`, input, async () => {
        const conversation = await participant(client, id, current, true);
        const recipientId = conversation.user_id === current.id ? conversation.organizer_id : conversation.user_id;
        const recipientRole = conversation.user_id === current.id ? "ORGANIZER" : "USER";
        if (!(await active(client, recipientId, recipientRole)))
          conflict("This account cannot receive messages");
        if (input.eventId) {
          if (
            !(
              await client.query("SELECT 1 FROM events WHERE id=$1 AND status<>'DELETED'", [input.eventId])
            ).rowCount
          )
            invalid("eventId", "Choose an existing event");
        }
        const recent = Number(
          (
            await client.query(
              "SELECT count(*) FROM messages WHERE sender_id=$1 AND created_at>now()-interval '1 minute'",
              [current.id],
            )
          ).rows[0].count,
        );
        if (recent >= messagesPerMinute)
          throw new HttpError(429, "RATE_LIMITED", "You are sending messages too quickly. Try again shortly");
        const seq = (
          await client.query(
            "UPDATE conversations SET last_seq=last_seq+1,last_message_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1 RETURNING last_seq",
            [id],
          )
        ).rows[0].last_seq;
        const message = (
          await client.query<{ id: string }>(
            "INSERT INTO messages(conversation_id,seq,sender_id,body,event_id) VALUES($1,$2,$3,$4,$5) RETURNING id",
            [id, seq, current.id, input.text, input.eventId ?? null],
          )
        ).rows[0];
        const sender = (
          await client.query<{ name: string }>(
            current.role === "USER"
              ? "SELECT first_name||' '||last_name AS name FROM user_profiles WHERE account_id=$1"
              : "SELECT name FROM organizer_profiles WHERE account_id=$1",
            [current.id],
          )
        ).rows[0];
        await notify(client, {
          accountId: recipientId,
          key: `message:${message.id}`,
          type: "NEW_MESSAGE",
          category: "MESSAGES",
          title: `New message from ${sender.name}`,
          body: input.text.length > previewLength ? `${input.text.slice(0, previewLength)}…` : input.text,
          link: `/chat/${id}`,
        });
        const created = (
          await client.query<MessageRow>(`${messageSql} WHERE m.id=$1`, [message.id])
        ).rows[0];
        return { status: 201, body: messageDto(created) };
      }),
    [...roles],
    true,
  );
}

const readInput = z.strictObject({ throughMessageId: z.uuid() });
export async function readConversation(request: Request, id: string) {
  const input = readInput.parse(await jsonBody(request));
  return access(
    request,
    async (client, current) => {
      await participant(client, id, current, true);
      const through = (
        await client.query("SELECT seq FROM messages WHERE id=$1 AND conversation_id=$2", [input.throughMessageId, id])
      ).rows[0];
      if (!through) missing("Message not found");
      const updated = await client.query(
        "UPDATE messages SET read_at=clock_timestamp(),updated_at=clock_timestamp() WHERE conversation_id=$1 AND sender_id<>$2 AND seq<=$3 AND read_at IS NULL",
        [id, current.id, through.seq],
      );
      const remaining = await client.query(
        "SELECT 1 FROM messages WHERE conversation_id=$1 AND sender_id<>$2 AND read_at IS NULL LIMIT 1",
        [id, current.id],
      );
      if (!remaining.rowCount)
        await client.query(
          "UPDATE notifications SET read_at=now(),updated_at=now() WHERE account_id=$1 AND type='NEW_MESSAGE' AND link=$2 AND read_at IS NULL",
          [current.id, `/chat/${id}`],
        );
      return Response.json({
        updatedCount: updated.rowCount ?? 0,
        unreadCount: await unreadTotal(client, current.id),
      });
    },
    [...roles],
    true,
  );
}
