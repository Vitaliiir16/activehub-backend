import { handler } from "@/modules/accounts/http";
import { changePassword } from "@/modules/accounts/service";
export const runtime = "nodejs";
export const POST = handler(changePassword);
