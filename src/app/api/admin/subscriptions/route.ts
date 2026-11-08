import { handler } from "@/modules/accounts/http";
import { listAllSubscriptions } from "@/modules/administration/subscriptions";
export const runtime = "nodejs";
export const GET = handler((request) => listAllSubscriptions(request));
