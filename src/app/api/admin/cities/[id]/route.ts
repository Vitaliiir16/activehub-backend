import { handler } from "@/modules/accounts/http";
import { editDictionaryItem } from "@/modules/administration/dictionaries";
export const runtime = "nodejs";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => editDictionaryItem(request, "cities", id))(request);
}
