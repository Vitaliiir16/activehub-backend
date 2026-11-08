import { handler } from "@/modules/accounts/http";
import { getProfile, updateProfile } from "@/modules/accounts/service";
export const runtime = "nodejs";
export const GET = handler(getProfile);
export const PATCH = handler(updateProfile);
