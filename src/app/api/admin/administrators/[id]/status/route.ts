import { handler } from "@/modules/accounts/http";
import { setAdminStatus } from "@/modules/accounts/service";
export const runtime = "nodejs";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => setAdminStatus(request, id))(request);
}
