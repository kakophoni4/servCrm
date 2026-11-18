'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {api} from '@/lib/api';
import {MobileFold} from '@/components/MobileFold';
import {groupParts} from './groups';
import styles from './Inventory.module.css';
type Part={id:string;name:string;category:string;quantity:number};
type Line={partId:string;quantity:number;applied?:number};
export function OrderParts({id,status}:{id:string;status:string}){
 const [savedItems,setSavedItems]=useState('[]');
 const [parts,setParts]=useState<Part[]>([]),[items,setItems]=useState<Line[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[loaded,setLoaded]=useState(false);
 useEffect(()=>{let live=true;setLoaded(false);Promise.all([api<Part[]>('/inventory'),api<{items:Line[]}>('/inventory/orders/'+id)]).then(([p,o])=>{if(live){setParts(p);setItems(o.items);setSavedItems(JSON.stringify(o.items.map(({partId,quantity})=>({partId,quantity}))));setLoaded(true)}}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[id,status]);
 async function save(){setBusy(true);setError('');setSaved(false);try{const result=await api<{items:Line[]}>('/inventory/orders/'+id,{method:'PUT',body:JSON.stringify({items:items.map(({partId,quantity})=>({partId,quantity}))})});setItems(result.items);setSavedItems(JSON.stringify(result.items.map(({partId,quantity})=>({partId,quantity}))));setParts(await api<Part[]>('/inventory'));setSaved(true)}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить')}finally{setBusy(false)}}
 const change=(i:number,v:Partial<Line>)=>{setSaved(false);setItems(items.map((x,n)=>n===i?{...x,...v}:x))};
 const dirty=loaded&&JSON.stringify(items.map(({partId,quantity})=>({partId,quantity})))!==savedItems;
 return <MobileFold title={`Запчасти со склада${items.length?' · '+items.reduce((s,x)=>s+(x.quantity||0),0):''}${dirty?' · не сохранено':''}`} className="panel">
 <div className={styles.rows}>
 <h2 className="order-side-title inventory-desktop-title">Запчасти со склада{dirty?' · не сохранено':''}</h2>
 {error&&<p className="error" role="alert">{error}</p>}
 {!loaded&&!error&&<p>Загрузка...</p>}
 {loaded&&!parts.length&&<p>Нет запчастей. <Link href="/inventory">Добавить запчасти</Link></p>}
 {items.map((item,i)=><div className={styles.row} key={i}>
 <select aria-label={`Запчасть ${i+1}`} disabled={busy} value={item.partId} onChange={e=>change(i,{partId:e.target.value})}><option value="">Выбрать запчасть</option>{groupParts(parts.filter(p=>p.id===item.partId||!items.some(x=>x.partId===p.id))).map(group=><optgroup key={group.name} label={group.name}>{group.parts.map(p=><option key={p.id} value={p.id}>{p.name} · осталось {p.quantity}</option>)}</optgroup>)}</select>
 <input aria-label={`Количество ${i+1}`} type="number" inputMode="numeric" min="1" max="1000000" disabled={busy} value={item.quantity||''} onChange={e=>change(i,{quantity:Number(e.target.value)})}/>
 <button type="button" className="btn secondary" disabled={busy} onClick={()=>{setItems(items.filter((_,n)=>n!==i));setSaved(false)}}>Убрать</button>
 </div>)}
 {loaded&&parts.length>0&&<div className={styles.actions}><button type="button" className="btn secondary" disabled={busy||items.length>=parts.length} onClick={()=>{setItems([...items,{partId:'',quantity:1}]);setSaved(false)}}>Добавить деталь</button><button type="button" className="btn" disabled={busy||items.some(x=>!x.partId||!Number.isInteger(x.quantity)||x.quantity<1)} onClick={save}>{busy?'Сохраняем...':'Сохранить запчасти'}</button></div>}
 {saved&&<p role="status">Запчасти сохранены{status==='DONE'?', остатки обновлены':''}.</p>}
 </div></MobileFold>;
}
