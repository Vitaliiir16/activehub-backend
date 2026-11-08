import { limits } from "../../infrastructure/limits";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { boundedBody, jsonBody, invalid } from "../accounts/http";
import { access, missing, conflict } from "./core";
import { eventRow, eventDto, visibleEvent } from "./catalog";
const directory = () => process.env.UPLOAD_DIR ?? "/app/uploads";
export function uploadEventPhoto(request: Request, id: string) {
  return access(
    request,
    async (client, current) => {
      const e = await eventRow(client, id, current, true);
      if (!["ACTIVE", "PAUSED"].includes(e.status))
        conflict("This event cannot accept photos");
      const photos = (
        await client.query(
          "SELECT id FROM event_photos WHERE event_id=$1 ORDER BY position",
          [id],
        )
      ).rows;
      if (photos.length >= limits().photos)
        invalid("file", `An event may have at most ${limits().photos} photos`);
      const bytes = await boundedBody(request, limits().uploadBytes + 65536);
      let form: FormData;
      try {
        form = await new Response(new Uint8Array(bytes), {
          headers: {
            "Content-Type": request.headers.get("content-type") ?? "",
          },
        }).formData();
      } catch {
        invalid("file", "Choose one JPEG, PNG or WebP image");
      }
      const file = form.get("file");
      if (
        [...form.keys()].length !== 1 ||
        !(file instanceof File) ||
        file.size === 0 ||
        file.size > limits().uploadBytes ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      )
        invalid("file", "Choose one JPEG, PNG or WebP image up to 5 MiB");
      let image: Buffer;
      try {
        const decoder = sharp(Buffer.from(await file.arrayBuffer()), {
          limitInputPixels: 16_000_000,
          failOn: "warning",
        });
        const meta = await decoder.metadata();
        if (`image/${meta.format}` !== file.type || (meta.pages ?? 1) > 1)
          throw Error("Invalid image");
        image = await decoder
          .rotate()
          .resize({
            width: 1600,
            height: 1200,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 85 })
          .toBuffer();
      } catch {
        invalid("file", "The image cannot be decoded safely");
      }
      const photoId = randomUUID(),
        filename = `${photoId}.webp`,
        path = join(directory(), filename);
      await mkdir(directory(), { recursive: true });
      await writeFile(path, image, { flag: "wx", mode: 0o600 });
      try {
        await client.query(
          "INSERT INTO event_photos(id,event_id,filename,position) VALUES($1,$2,$3,$4)",
          [photoId, id, filename, photos.length],
        );
      } catch (error) {
        await rm(path, { force: true });
        throw error;
      }
      return Response.json(
        {
          id: photoId,
          url: `/api/event-photos/${photoId}`,
          position: photos.length,
        },
        { status: 201 },
      );
    },
    ["ORGANIZER"],
    true,
  );
}
export function orderEventPhotos(request: Request, id: string, admin = false) {
  return access(
    request,
    async (client, current) => {
      const input = z
        .strictObject({
          photoIds: z
            .array(z.uuid())
            .max(8)
            .refine((ids) => new Set(ids).size === ids.length),
        })
        .parse(await jsonBody(request));
      const e = await eventRow(client, id, current, true);
      const ids = (
        await client.query("SELECT id FROM event_photos WHERE event_id=$1", [
          id,
        ])
      ).rows.map((row) => row.id as string);
      if (
        ids.length !== input.photoIds.length ||
        ids.some((value) => !input.photoIds.includes(value))
      )
        invalid("photoIds", "Include each existing event photo exactly once");
      for (const [position, photoId] of input.photoIds.entries())
        await client.query(
          "UPDATE event_photos SET position=$1 WHERE id=$2 AND event_id=$3",
          [position, photoId, id],
        );
      return Response.json(await eventDto(client, e));
    },
    admin ? ["ADMIN"] : ["ORGANIZER"],
    true,
  );
}
export function deleteEventPhoto(request: Request, id: string, admin = false) {
  z.uuid().parse(id);
  return access(
    request,
    async (client, current) => {
      const row = (
        await client.query("SELECT event_id FROM event_photos WHERE id=$1", [
          id,
        ])
      ).rows[0];
      if (!row) missing("Photo not found");
      await eventRow(client, row.event_id, current, true);
      await client.query("DELETE FROM event_photos WHERE id=$1", [id]);
      await client.query(
        "UPDATE event_photos p SET position=x.position FROM(SELECT id,(row_number() OVER(ORDER BY position)-1)::int AS position FROM event_photos WHERE event_id=$1)x WHERE p.id=x.id",
        [row.event_id],
      );
      return new Response(null, { status: 204 });
    },
    admin ? ["ADMIN"] : ["ORGANIZER"],
    true,
  );
}
export function getEventPhoto(request: Request, id: string) {
  z.uuid().parse(id);
  return access(request, async (client, current) => {
    const row = (
      await client.query("SELECT event_id FROM event_photos WHERE id=$1", [id])
    ).rows[0];
    if (!row) missing("Photo not found");
    await visibleEvent(client, row.event_id, current);
    let bytes: Buffer;
    try {
      bytes = await readFile(join(directory(), `${id}.webp`));
    } catch {
      missing("Photo not found");
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  });
}
export function getOrganizerLogo(request: Request, id: string) {
  z.uuid().parse(id);
  return access(request, async (client) => {
    const row = (
      await client.query(
        "SELECT p.logo_id FROM organizer_profiles p JOIN accounts a ON a.id=p.account_id WHERE p.account_id=$1 AND a.status='ACTIVE'",
        [id],
      )
    ).rows[0];
    if (!row?.logo_id) missing("Logo not found");
    let bytes: Buffer;
    try {
      bytes = await readFile(join(directory(), `${row.logo_id}.webp`));
    } catch {
      missing("Logo not found");
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  });
}
