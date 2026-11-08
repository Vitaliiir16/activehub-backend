import { handler } from "@/modules/accounts/http";
import { listSessions } from "@/modules/marketplace/catalog";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => listSessions(request, id))(request);
}
