import {handler} from "@/modules/accounts/http";
import {archivePlan} from "@/modules/marketplace/subscriptions";
export const runtime="nodejs";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){const{id}=await context.params;return handler(request=>archivePlan(request,id))(request);}
