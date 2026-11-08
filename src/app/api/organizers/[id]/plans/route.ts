import {handler} from "@/modules/accounts/http";
import {listPlans} from "@/modules/marketplace/subscriptions";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){const{id}=await context.params;return handler(request=>listPlans(request,id))(request);}
