'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
type Master = {id:string; user:{fullName:string;phone?:string|null}};
type Order = {id:string;publicId:string;masterId?:string;status:string;client:{name:string}};
export default function MastersPage(){
 const [masters,setMasters]=useState<Master[]>([]);
 const [orders,setOrders]=useState<Order[]>([]);
 const [name,setName]=useState('');const [phone,setPhone]=useState('');
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function load(){const [m,o]=await Promise.all([api<Master[]>('/masters'),api<Order[]>('/orders')]);setMasters(m);setOrders(o)}
 useEffect(()=>{load().catch(e=>setError(e.message))},[]);
 async function archive(id:string){if(!window.confirm('Убрать мастера из активных? Его открытые заявки останутся без исполнителя. История сохранится.'))return;setError('');try{await api('/masters/'+id+'/deactivate',{method:'POST'});await load()}catch(e){setError(e instanceof Error?e.message:'Ошибка')}}
 async function add(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await api('/masters',{method:'POST',body:JSON.stringify({fullName:name.trim(),phone,cityId:getStoredUser()?.cityId||undefined})});setName('');setPhone('');await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить')}finally{setBusy(false)}}
 return <div><h1 className="page-title">Мастера</h1><form className="panel" onSubmit={add}><h2>Добавить мастера</h2><div className="field"><label htmlFor="master-name">Имя</label><input id="master-name" required value={name} onChange={e=>setName(e.target.value)}/></div><div className="field"><label htmlFor="master-phone">Телефон</label><input id="master-phone" type="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></div><button className="btn" disabled={busy||!name.trim()}>{busy?'Сохраняем…':'Добавить'}</button></form>{error&&<p className="error">{error}</p>}<div className="panel"><h2>Текущие заявки мастеров</h2>{!masters.length&&!error&&<p className="muted">Добавьте мастера, затем назначьте его в карточке заявки.</p>}{masters.map(m=>{const active=orders.filter(o=>o.masterId===m.id&&!['DONE','REFUSAL','CANCELLED_CC'].includes(o.status));return <section key={m.id}><h3>{m.user.fullName}</h3>{m.user.phone&&<a href={'tel:'+m.user.phone}>{m.user.phone}</a>}<p>В работе: {active.length}</p><button className="btn secondary" onClick={()=>archive(m.id)}>Убрать из активных</button>{active.map(o=><p key={o.id}><Link href={'/orders/'+o.id}>{o.publicId} · {o.client.name}</Link></p>)}</section>})}</div></div>
}
