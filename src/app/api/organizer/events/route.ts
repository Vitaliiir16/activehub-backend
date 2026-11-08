import { handler } from "@/modules/accounts/http";
import { listEvents, createEvent } from "@/modules/marketplace/catalog";
export const runtime = "nodejs";
export const GET = handler((request) => listEvents(request, true));
export const POST = handler((request) => createEvent(request));
