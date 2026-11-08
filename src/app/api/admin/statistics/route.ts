import { handler } from "@/modules/accounts/http";
import { getStatistics } from "@/modules/statistics/platform";
export const runtime = "nodejs";
export const GET = handler((request) => getStatistics(request));
