import { handler } from "@/modules/accounts/http";
import { listAccounts } from "@/modules/administration/accounts";
export const runtime = "nodejs";
export const GET = handler((request) => listAccounts(request, "USER"));
