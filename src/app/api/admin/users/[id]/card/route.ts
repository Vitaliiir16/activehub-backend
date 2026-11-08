import { handler } from "@/modules/accounts/http";
import { adminAssignCard } from "@/modules/loyalty/service";
export const runtime = "nodejs";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => adminAssignCard(request, id))(request);
}
