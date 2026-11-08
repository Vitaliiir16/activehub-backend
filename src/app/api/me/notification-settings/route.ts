import { handler } from "@/modules/accounts/http";
import { getSettings, updateSettings } from "@/modules/accounts/service";
export const runtime = "nodejs";
export const GET = handler(getSettings);
export const PATCH = handler(updateSettings);
