import { handler } from "@/modules/accounts/http";
import {
  createConversation,
  listConversations,
} from "@/modules/communications/chat";
export const runtime = "nodejs";
export const GET = handler((request) => listConversations(request));
export const POST = handler((request) => createConversation(request));
