import { handler } from "@/modules/accounts/http";
import { cancelBooking } from "@/modules/marketplace/bookings";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => cancelBooking(request, id))(request);
}
