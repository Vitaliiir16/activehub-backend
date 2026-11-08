import { handler } from "@/modules/accounts/http";
import { adminSetLevel } from "@/modules/loyalty/service";
export const runtime = "nodejs";
export async function PUT(
  request: Request,
  context: { params: Promise<{ level: string }> },
) {
  const { level } = await context.params;
  return handler((request) => adminSetLevel(request, level))(request);
}
