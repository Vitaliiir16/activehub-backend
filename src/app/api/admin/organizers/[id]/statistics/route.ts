import { handler } from "@/modules/accounts/http";
import { getAdminOrganizerStatistics } from "@/modules/statistics/organizer";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => getAdminOrganizerStatistics(request, id))(request);
}
