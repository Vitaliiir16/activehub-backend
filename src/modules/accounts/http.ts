import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { database } from "../../infrastructure/database";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}
export function invalid(field: string, message: string): never {
  throw new HttpError(
    422,
    "VALIDATION_FAILED",
    "Check the highlighted fields",
    { [field]: [message] },
  );
}
export async function transaction<T>(
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function jsonBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(
      400,
      "BAD_REQUEST",
      "Use an application/json request body",
    );
  const text = await boundedBody(request, 32 * 1024);
  try {
    return JSON.parse(text.toString("utf8"));
  } catch {
    throw new HttpError(400, "BAD_REQUEST", "Invalid JSON request body");
  }
}
export async function boundedBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new HttpError(413, "BAD_REQUEST", "Request body is too large");
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, "BAD_REQUEST", "Request body is too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export function handler(action: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    const requestId = randomUUID();
    try {
      const response = await action(request);
      response.headers.set("X-Request-ID", requestId);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Content-Type-Options", "nosniff");
      return response;
    } catch (error) {
      let failure =
        error instanceof HttpError
          ? error
          : new HttpError(
              500,
              "INTERNAL_ERROR",
              "The request could not be completed",
            );
      if (error instanceof z.ZodError) {
        const fields: Record<string, string[]> = {};
        for (const issue of error.issues) {
          const key = issue.path.join(".") || "form";
          (fields[key] ??= []).push(issue.message);
        }
        failure = new HttpError(
          422,
          "VALIDATION_FAILED",
          "Check the highlighted fields",
          fields,
        );
      } else if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        error.code === "23505"
      )
        failure = new HttpError(
          409,
          "CONFLICT",
          "This email is already registered",
          { email: ["This email is already registered"] },
        );
      const headers: Record<string, string> = {
        "X-Request-ID": requestId,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      };
      if (failure.status === 429) headers["Retry-After"] = "60";
      return Response.json(
        {
          error: {
            code: failure.code,
            message: failure.message,
            requestId,
            ...(failure.fields ? { fields: failure.fields } : {}),
          },
        },
        { status: failure.status, headers },
      );
    }
  };
}
