import { handler } from "@/modules/accounts/http";
import { createAdministrator } from "@/modules/accounts/service";
export const runtime = "nodejs";
export const POST = handler(createAdministrator);
