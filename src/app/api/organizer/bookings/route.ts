import { handler } from "@/modules/accounts/http";
import { listBookings } from "@/modules/marketplace/bookings";
export const runtime="nodejs";
export const GET=handler(request=>listBookings(request,true));
