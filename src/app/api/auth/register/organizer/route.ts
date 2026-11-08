import { handler } from "@/modules/accounts/http";
import { register } from "@/modules/accounts/service";
export const runtime = "nodejs";
export const POST = handler((request) => register(request, "ORGANIZER"));
