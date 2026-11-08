import { handler } from "@/modules/accounts/http";
import { listOrganizers } from "@/modules/marketplace/catalog";
export const runtime = "nodejs";
export const GET = handler((request) => listOrganizers(request));
