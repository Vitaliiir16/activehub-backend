import { handler } from "@/modules/accounts/http";
import { getEvent } from "@/modules/marketplace/catalog";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => getEvent(request, id))(request);
}
