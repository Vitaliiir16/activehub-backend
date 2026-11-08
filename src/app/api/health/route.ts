import { randomUUID } from "node:crypto";
import { assertDatabaseReady, database } from "@/infrastructure/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const requestId = randomUUID();
  const headers = { "Cache-Control": "no-store", "X-Request-ID": requestId };
  try {
    await assertDatabaseReady(database());
    return Response.json(
      {
        status: "ok",
        service: "activehub-api",
        version: "0.1.0",
        database: "ready",
      },
      { headers },
    );
  } catch {
    return Response.json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Service is not ready",
          requestId,
        },
      },
      { status: 503, headers },
    );
  }
}
