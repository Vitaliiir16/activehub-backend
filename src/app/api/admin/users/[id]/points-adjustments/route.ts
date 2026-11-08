import { handler } from "@/modules/accounts/http";
import { adminAdjustPoints } from "@/modules/loyalty/service";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => adminAdjustPoints(request, id))(request);
}
