import { handler } from "@/modules/accounts/http";
import {
  deleteAccount,
  editAccount,
  getAccount,
} from "@/modules/administration/accounts";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => getAccount(request, id, "ORGANIZER"))(request);
}
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => editAccount(request, id, "ORGANIZER"))(request);
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => deleteAccount(request, id, "ORGANIZER"))(request);
}
