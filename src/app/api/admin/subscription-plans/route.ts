import { handler } from "@/modules/accounts/http";
import { listAllPlans } from "@/modules/administration/subscriptions";
export const runtime = "nodejs";
export const GET = handler((request) => listAllPlans(request));
