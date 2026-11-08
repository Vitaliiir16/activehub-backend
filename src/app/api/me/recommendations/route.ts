import { handler } from "@/modules/accounts/http";
import { listEvents } from "@/modules/marketplace/catalog";
export const runtime = "nodejs";
export const GET = handler((request) => listEvents(request, false, true));
