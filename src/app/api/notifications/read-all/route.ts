import { handler } from "@/modules/accounts/http";
import { readNotification } from "@/modules/accounts/notifications";
export const runtime = "nodejs";
export const POST = handler((request) => readNotification(request));
