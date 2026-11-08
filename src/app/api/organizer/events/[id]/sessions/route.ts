import { handler } from "@/modules/accounts/http";
import { createSession } from "@/modules/marketplace/catalog";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => createSession(request, id))(request);
}
