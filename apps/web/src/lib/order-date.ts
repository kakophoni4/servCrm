const day = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Samara',year:'numeric',month:'2-digit',day:'2-digit'});
export function isScheduledToday(scheduledAt:string|null|undefined,now:number):boolean {
 if(!scheduledAt)return false;
 const date=new Date(scheduledAt);
 return Number.isFinite(date.getTime())&&day.format(date)===day.format(new Date(now));
}

export function orderDateInput(iso?:string|null):string {
 if(!iso)return '';const d=new Date(iso);if(!Number.isFinite(d.getTime()))return '';
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Samara',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);
 const part=(key:string)=>p.find(x=>x.type===key)?.value||'';
 return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
export function orderDateIso(value:string):string {
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Некорректная дата или время');
 const d=new Date(value+':00+04:00');if(!Number.isFinite(d.getTime())||orderDateInput(d.toISOString())!==value)throw new Error('Некорректная дата или время');return d.toISOString();
}
export function orderDay(offset=0,now=new Date()):string {return new Date(new Date(orderDateInput(now.toISOString()).slice(0,10)+'T12:00:00Z').getTime()+offset*86400000).toISOString().slice(0,10);}
