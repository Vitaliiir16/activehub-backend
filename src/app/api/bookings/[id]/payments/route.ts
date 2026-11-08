import { handler } from "@/modules/accounts/http";
import { payBooking } from "@/modules/marketplace/payments";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => payBooking(request, id))(request);
}
