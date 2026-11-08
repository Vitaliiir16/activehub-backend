import { handler } from "@/modules/accounts/http";
import {
  adminGetLoyaltyRules,
  adminSetLoyaltyRules,
} from "@/modules/loyalty/service";
export const runtime = "nodejs";
export const GET = handler((request) => adminGetLoyaltyRules(request));
export const PUT = handler((request) => adminSetLoyaltyRules(request));
