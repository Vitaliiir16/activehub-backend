import { handler } from "@/modules/accounts/http";
import { listPointsTransactions } from "@/modules/loyalty/service";
export const runtime = "nodejs";
export const GET = handler((request) => listPointsTransactions(request));
