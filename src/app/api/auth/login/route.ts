import { handler } from "@/modules/accounts/http";
import { login } from "@/modules/accounts/service";
export const runtime = "nodejs";
export const POST = handler(login);
