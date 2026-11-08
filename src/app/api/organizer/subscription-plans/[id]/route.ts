import {handler} from "@/modules/accounts/http";
import {savePlan} from "@/modules/marketplace/subscriptions";
export const runtime="nodejs";
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){const{id}=await context.params;return handler(request=>savePlan(request,id))(request);}
