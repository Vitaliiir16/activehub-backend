import { handler } from "@/modules/accounts/http";
import { getOrganizerDashboard } from "@/modules/statistics/organizer";
export const runtime = "nodejs";
export const GET = handler((request) => getOrganizerDashboard(request));
