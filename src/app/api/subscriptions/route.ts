import {handler} from "@/modules/accounts/http";
import {listSubscriptions,purchaseSubscription} from "@/modules/marketplace/subscriptions";
export const runtime="nodejs";
export const GET=handler(request=>listSubscriptions(request));
export const POST=handler(request=>purchaseSubscription(request));
