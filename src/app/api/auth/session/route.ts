import { handler } from "@/modules/accounts/http";
import { getSession } from "@/modules/accounts/service";
export const runtime = "nodejs";
export const GET = handler(getSession);
