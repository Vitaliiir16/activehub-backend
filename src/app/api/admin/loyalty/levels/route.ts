import { handler } from "@/modules/accounts/http";
import { adminGetLevels } from "@/modules/loyalty/service";
export const runtime = "nodejs";
export const GET = handler((request) => adminGetLevels(request));
