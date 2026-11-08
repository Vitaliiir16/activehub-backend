import { handler } from "@/modules/accounts/http";
import { readConversation } from "@/modules/communications/chat";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => readConversation(request, id))(request);
}
