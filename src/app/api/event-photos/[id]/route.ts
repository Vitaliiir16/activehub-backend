import { handler } from "@/modules/accounts/http";
import { getEventPhoto } from "@/modules/marketplace/photos";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => getEventPhoto(request, id))(request);
}
