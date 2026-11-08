import { handler } from "@/modules/accounts/http";
import {
  createDictionaryItem,
  listDictionaryAdmin,
} from "@/modules/administration/dictionaries";
export const runtime = "nodejs";
export const GET = handler((request) => listDictionaryAdmin(request, "directions"));
export const POST = handler((request) => createDictionaryItem(request, "directions"));
