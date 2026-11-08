import { handler } from "@/modules/accounts/http";
import { getImage } from "@/modules/accounts/images";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => getImage(request, id))(request);
}
