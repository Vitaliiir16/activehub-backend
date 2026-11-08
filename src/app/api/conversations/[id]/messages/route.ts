import { handler } from "@/modules/accounts/http";
import { listMessages, sendMessage } from "@/modules/communications/chat";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => listMessages(request, id))(request);
}
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => sendMessage(request, id))(request);
}
