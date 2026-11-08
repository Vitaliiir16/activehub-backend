import { handler } from "@/modules/accounts/http";
import { uploadEventPhoto } from "@/modules/marketplace/photos";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => uploadEventPhoto(request, id))(request);
}
