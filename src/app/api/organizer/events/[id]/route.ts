import { handler } from "@/modules/accounts/http";
import {
  getEvent,
  updateEvent,
  cancelEvent,
} from "@/modules/marketplace/catalog";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => getEvent(request, id, true))(request);
}
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => updateEvent(request, id))(request);
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handler((request) => cancelEvent(request, id, true))(request);
}
