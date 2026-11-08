import { handler } from "@/modules/accounts/http";
import { logout } from "@/modules/accounts/service";
export const runtime = "nodejs";
export const POST = handler(logout);
