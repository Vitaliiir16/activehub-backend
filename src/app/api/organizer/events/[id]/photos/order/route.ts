import { handler } from "@/modules/accounts/http";
import { orderEventPhotos } from "@/modules/marketplace/photos";
export const runtime = "nodejs";
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => orderEventPhotos(request, id))(request);
}
