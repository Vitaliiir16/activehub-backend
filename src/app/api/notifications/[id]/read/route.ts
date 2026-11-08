import { handler } from "@/modules/accounts/http";
import { readNotification } from "@/modules/accounts/notifications";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => readNotification(request, id))(request);
}
