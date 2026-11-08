import {handler} from "@/modules/accounts/http";
import {previewBooking} from "@/modules/marketplace/bookings";
export const runtime="nodejs";
export const POST=handler(previewBooking);
