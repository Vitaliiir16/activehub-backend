import { handler } from "@/modules/accounts/http";
import { updateSession, cancelSession } from "@/modules/marketplace/catalog";
export const runtime = "nodejs";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => updateSession(request, id))(request);
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => cancelSession(request, id, true))(request);
}
