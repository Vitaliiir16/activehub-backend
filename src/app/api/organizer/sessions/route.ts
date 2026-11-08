import { handler } from "@/modules/accounts/http";
import { listSessions } from "@/modules/marketplace/catalog";
export const runtime = "nodejs";
export const GET = handler((request) => listSessions(request, undefined, true));
