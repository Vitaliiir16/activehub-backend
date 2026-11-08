import { handler } from "@/modules/accounts/http";
import {
  createDictionaryItem,
  listDictionaryAdmin,
} from "@/modules/administration/dictionaries";
export const runtime = "nodejs";
export const GET = handler((request) => listDictionaryAdmin(request, "cities"));
export const POST = handler((request) => createDictionaryItem(request, "cities"));
