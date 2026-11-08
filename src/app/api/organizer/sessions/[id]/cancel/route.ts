import { handler } from "@/modules/accounts/http";
import { cancelSession } from "@/modules/marketplace/catalog";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => cancelSession(request, id))(request);
}
