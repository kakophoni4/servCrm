type Assignment = {master?:unknown;masterId?:string|null;isPersonal?:boolean;isServiceCenter?:boolean;status:string;createdAt:string};
export function isOverdueUnassigned(order:Assignment,now:number):boolean {
 if(order.master||order.masterId||order.isPersonal||order.isServiceCenter||['DONE','REFUSAL','CANCELLED_CC'].includes(order.status))return false;
 const created=Date.parse(order.createdAt);
 return Number.isFinite(created)&&now-created>=5*60*1000;
}
