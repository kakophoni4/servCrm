'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {api} from '@/lib/api';
import {MobileFold} from '@/components/MobileFold';
import styles from './Inventory.module.css';
type Part={id:string;name:string;category:string;quantity:number};
type Line={partId:string;quantity:number;applied?:number};
export function OrderParts({id,status}:{id:string;status:string}){
 const [parts,setParts]=useState<Part[]>([]),[items,setItems]=useState<Line[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[loaded,setLoaded]=useState(false);
 useEffect(()=>{let live=true;setLoaded(false);Promise.all([api<Part[]>('/inventory'),api<{items:Line[]}>('/inventory/orders/'+id)]).then(([p,o])=>{if(live){setParts(p);setItems(o.items);setLoaded(true)}}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[id,status]);
 async function save(){setBusy(true);setError('');setSaved(false);try{const result=await api<{items:Line[]}>('/inventory/orders/'+id,{method:'PUT',body:JSON.stringify({items:items.map(({partId,quantity})=>({partId,quantity}))})});setItems(result.items);setParts(await api<Part[]>('/inventory'));setSaved(true)}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить')}finally{setBusy(false)}}
 const change=(i:number,v:Partial<Line>)=>{setSaved(false);setItems(items.map((x,n)=>n===i?{...x,...v}:x))};
 return <MobileFold title={`Запчасти со склада${items.length?' · '+items.reduce((s,x)=>s+(x.quantity||0),0):''}`} className="panel">
 <div className={styles.rows}>
 {error&&<p className="error" role="alert">{error}</p>}
 {!loaded&&!error&&<p>Загрузка...</p>}
 {loaded&&!parts.length&&<p>Нет запчастей. <Link href="/inventory">Добавить запчасти</Link></p>}
 {items.map((item,i)=><div className={styles.row} key={i}>
 <select aria-label={`Запчасть ${i+1}`} disabled={busy} value={item.partId} onChange={e=>change(i,{partId:e.target.value})}><option value="">Выбрать запчасть</option>{parts.filter(p=>p.id===item.partId||!items.some(x=>x.partId===p.id)).map(p=><option key={p.id} value={p.id}>{p.category?p.category+' · ':''}{p.name} · осталось {p.quantity}</option>)}</select>
 <input aria-label={`Количество ${i+1}`} type="number" inputMode="numeric" min="1" max="1000000" disabled={busy} value={item.quantity||''} onChange={e=>change(i,{quantity:Number(e.target.value)})}/>
 <button type="button" className="btn secondary" disabled={busy} onClick={()=>{setItems(items.filter((_,n)=>n!==i));setSaved(false)}}>Убрать</button>
 </div>)}
 {loaded&&parts.length>0&&<div className={styles.actions}><button type="button" className="btn secondary" disabled={busy||items.length>=parts.length} onClick={()=>{setItems([...items,{partId:'',quantity:1}]);setSaved(false)}}>Добавить деталь</button><button type="button" className="btn" disabled={busy||items.some(x=>!x.partId||!Number.isInteger(x.quantity)||x.quantity<1)} onClick={save}>{busy?'Сохраняем...':'Сохранить запчасти'}</button></div>}
 {saved&&<p role="status">Запчасти сохранены{status==='DONE'?', остатки обновлены':''}.</p>}
 </div></MobileFold>;
}
