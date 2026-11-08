import { handler } from "@/modules/accounts/http";
import { getCsrf } from "@/modules/accounts/service";
export const runtime = "nodejs";
export const GET = handler(getCsrf);
