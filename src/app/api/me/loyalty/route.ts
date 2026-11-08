import { handler } from "@/modules/accounts/http";
import { getLoyalty } from "@/modules/loyalty/service";
export const runtime = "nodejs";
export const GET = handler((request) => getLoyalty(request));
