import { handler } from "@/modules/accounts/http";
import { getBooking } from "@/modules/marketplace/bookings";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => getBooking(request, id))(request);
}
