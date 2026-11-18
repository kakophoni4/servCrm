'use client';
import {FormEvent,useState} from 'react';
import Link from 'next/link';
import {api} from '@/lib/api';
export type CashBalance={masterId:string;due:number;paid:number;remaining:number;credit:number;unpaid?:{id:string;publicId:string|null;address:string;date:string;remaining:number;kind:string}[]};
const money=(n:number)=>n.toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽';
export function MasterCash({balance,onSaved}:{balance:CashBalance;onSaved:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[amount,setAmount]=useState(''),[requestId,setRequestId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{await api('/settlements/cash-receipt',{method:'POST',body:JSON.stringify({masterId:balance.masterId,amount:Number(amount.replace(',','.')),requestId})});setOpen(false);await onSaved()}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить')}finally{setBusy(false)}}
 return <div style={{padding:'12px 0',borderTop:'1px solid var(--border)',display:'grid',gap:8}}>
 <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><span>К сдаче <strong>{money(balance.remaining)}</strong></span><span className="muted">Сдано {money(balance.paid)}</span></div>
 {!!balance.unpaid?.length&&<details><summary>Несданные заявки · {balance.unpaid.length}</summary><div style={{display:'grid',gap:12,paddingTop:10}}>{balance.unpaid.map(e=><div key={e.id}>{e.kind==='order'?<Link href={'/orders/'+e.id}>№ {e.publicId}</Link>:<strong>Штраф</strong>}<div>{e.address}</div><div className="muted">{new Date(e.date).toLocaleDateString('ru-RU',{timeZone:'Europe/Samara'})} - <strong>{money(e.remaining)}</strong></div></div>)}</div></details>}
 {balance.credit>0&&<span className="muted">Переплата {money(balance.credit)}</span>}
 {balance.remaining===0?<span className="badge badge-ok">{balance.paid>0?'Деньги сданы':'Долга нет'}</span>:!open?<button className="btn secondary" onClick={()=>{setAmount(String(balance.remaining));setRequestId(crypto.randomUUID());setError('');setOpen(true)}}>Мастер сдал деньги</button>:<form onSubmit={save} style={{display:'grid',gap:8}}>
 <label className="field">Получено, ₽<input aria-label="Получено от мастера" required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy}/></label>
 <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="btn" disabled={busy}>{busy?'Сохраняем...':'Подтвердить получение'}</button><button type="button" className="btn secondary" disabled={busy} onClick={()=>setOpen(false)}>Отмена</button></div>
 </form>}
 {error&&<p className="error" role="alert">{error}</p>}
 </div>;
}
