const day = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'});
export function isScheduledToday(scheduledAt:string|null|undefined,now:number):boolean {
 if(!scheduledAt)return false;
 const date=new Date(scheduledAt);
 return Number.isFinite(date.getTime())&&day.format(date)===day.format(new Date(now));
}
