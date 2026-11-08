import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { boundedBody, HttpError, invalid } from "./http";
import { protectedAction } from "./service";

const directory = () => process.env.UPLOAD_DIR ?? "/app/uploads";
export async function uploadImage(request: Request) {
  return protectedAction(
    request,
    async (client, current) => {
      const bytes = await boundedBody(request, 5 * 1024 * 1024 + 65536);
      let form: FormData;
      try {
        form = await new Response(new Uint8Array(bytes), {
          headers: {
            "Content-Type": request.headers.get("content-type") ?? "",
          },
        }).formData();
      } catch {
        throw new HttpError(
          400,
          "BAD_REQUEST",
          "Use multipart/form-data with a file field",
        );
      }
      const file = form.get("file");
      if (
        [...form.keys()].length !== 1 ||
        !(file instanceof File) ||
        !file.size ||
        file.size > 5 * 1024 * 1024
      )
        invalid("file", "Choose one image up to 5 MiB");
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
        invalid("file", "Choose a JPEG, PNG or WebP image");
      let image: Buffer;
      try {
        const input = Buffer.from(await file.arrayBuffer());
        const decoder = sharp(input, {
          limitInputPixels: 16_000_000,
          animated: false,
          failOn: "warning",
        });
        const metadata = await decoder.metadata();
        if (
          `image/${metadata.format}` !== file.type ||
          (metadata.pages ?? 1) > 1
        )
          invalid(
            "file",
            "Choose a still JPEG, PNG or WebP image with a matching file type",
          );
        image = await decoder
          .rotate()
          .resize({
            width: 1024,
            height: 1024,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 85 })
          .toBuffer();
      } catch {
        invalid("file", "The image is invalid or too large to decode");
      }
      const id = randomUUID(),
        filename = `${id}.webp`,
        path = join(directory(), filename);
      await mkdir(directory(), { recursive: true });
      await writeFile(path, image, { flag: "wx", mode: 0o600 });
      try {
        await client.query(
          "INSERT INTO profile_images (id,owner_id,filename) VALUES ($1,$2,$3)",
          [id, current.id, filename],
        );
        const table =
            current.role === "USER" ? "user_profiles" : "organizer_profiles",
          column = current.role === "USER" ? "photo_id" : "logo_id";
        await client.query(
          `UPDATE ${table} SET ${column}=$1,updated_at=now() WHERE account_id=$2`,
          [id, current.id],
        );
        await client.query("UPDATE accounts SET updated_at=now() WHERE id=$1", [
          current.id,
        ]);
        return Response.json({ id, url: `/api/media/${id}`, position: 0 });
      } catch (error) {
        await rm(path, { force: true });
        throw error;
      }
    },
    ["USER", "ORGANIZER"],
    true,
  );
}
export function getImage(request: Request, id: string) {
  z.uuid().parse(id);
  return protectedAction(
    request,
    async (client, current) => {
      const row = (
        await client.query(
          "SELECT filename FROM profile_images WHERE id=$1 AND owner_id=$2",
          [id, current.id],
        )
      ).rows[0];
      if (!row) throw new HttpError(404, "NOT_FOUND", "Image not found");
      let data: Buffer;
      try {
        data = await readFile(join(directory(), `${id}.webp`));
      } catch {
        throw new HttpError(404, "NOT_FOUND", "Image not found");
      }
      return new Response(new Uint8Array(data), {
        headers: {
          "Content-Type": "image/webp",
          "Content-Disposition": "inline",
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      });
    },
    ["USER", "ORGANIZER"],
  );
}
