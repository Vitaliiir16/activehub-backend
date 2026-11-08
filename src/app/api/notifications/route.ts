import { handler } from "@/modules/accounts/http";
import { listNotifications } from "@/modules/accounts/notifications";
export const runtime = "nodejs";
export const GET = handler(listNotifications);
