export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json(
    { status: "ok", service: "activehub-api", version: "0.1.0" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
