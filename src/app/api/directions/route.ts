import { handler } from "@/modules/accounts/http";
import { listDictionary } from "@/modules/accounts/service";
export const runtime = "nodejs";
export const GET = handler((request) => listDictionary(request, "directions"));
