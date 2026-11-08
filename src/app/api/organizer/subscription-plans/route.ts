import {handler} from "@/modules/accounts/http";
import {listPlans,savePlan} from "@/modules/marketplace/subscriptions";
export const runtime="nodejs";
export const GET=handler(request=>listPlans(request));
export const POST=handler(request=>savePlan(request));
