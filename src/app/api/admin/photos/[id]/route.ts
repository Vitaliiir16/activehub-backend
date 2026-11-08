import { handler } from "@/modules/accounts/http";
import { deleteEventPhoto } from "@/modules/marketplace/photos";
export const runtime = "nodejs";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => deleteEventPhoto(request, id, true))(request);
}
