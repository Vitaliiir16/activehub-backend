import { handler } from "@/modules/accounts/http";
import { uploadImage } from "@/modules/accounts/images";
export const runtime = "nodejs";
export const POST = handler(uploadImage);
