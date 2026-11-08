import { handler } from "@/modules/accounts/http";
import { setAccountStatus } from "@/modules/administration/accounts";
export const runtime = "nodejs";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => setAccountStatus(request, id, "ORGANIZER"))(request);
}
