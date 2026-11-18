'use client';
import { useEffect,useState } from 'react';
export function SdDeadline({status,from,due,prepay}:{status:string;from?:string|null;due?:string|null;prepay?:string|number}) {
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(t)},[]);
 if(status!=='IN_PROGRESS_SD')return null;
 const format=(v:string)=>new Date(v).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',timeZone:'Europe/Samara'});
 const overdue=!!due&&new Date(due).getTime()<now;
 return <div className={`sd-deadline${overdue?' overdue':''}`}><strong>{overdue?'СД · срок истёк':'СД'}</strong>{due&&<span>{from&&format(from)!==format(due)?`${format(from)} - ${format(due)}`:`до ${format(due)}`}</span>}{prepay!==undefined&&<span>Предоплата: {Number(prepay).toLocaleString('ru-RU')} ₽</span>}</div>;
}
