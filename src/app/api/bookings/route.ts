import { handler } from "@/modules/accounts/http";
import { listBookings,createBooking } from "@/modules/marketplace/bookings";
export const runtime="nodejs";
export const GET=handler(request=>listBookings(request));
export const POST=handler(request=>createBooking(request));
