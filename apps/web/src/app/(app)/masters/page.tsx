'use client';
import Link from 'next/link';
import { MobileFold } from '@/components/MobileFold';
import { formatRuPhoneDisplay } from '@/lib/phone';
import styles from '@/components/settings/OwnerPanels.module.css';
import { FormEvent, useEffect, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
type Master = {id:string;address?:string; user:{telegramId?:string|null;fullName:string;phone?:string|null}};
type Order = {id:string;publicId:string;masterId?:string;status:string;client:{name:string}};
export default function MastersPage(){
 const [showForm,setShowForm]=useState(false);
 const [groups,setGroups]=useState<Record<string,{chatId:string;title:string}|null>>({});
 const [commands,setCommands]=useState<Record<string,string>>({});
 const [groupBusy,setGroupBusy]=useState('');
 const [links,setLinks]=useState<Record<string,string>>({});
 const [masters,setMasters]=useState<Master[]>([]);
 const [orders,setOrders]=useState<Order[]>([]);
 const [address,setAddress]=useState('');const [editId,setEditId]=useState('');
 const [name,setName]=useState('');const [phone,setPhone]=useState('');
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function load(){const [m,o]=await Promise.all([api<Master[]>('/masters'),api<Order[]>('/orders')]);setMasters(m);setOrders(o);const g=await Promise.all(m.map(async x=>[x.id,await api<{chatId:string;title:string}|null>(`/bot/masters/${x.id}/group`)] as const));setGroups(Object.fromEntries(g))}
 useEffect(()=>{load().catch(e=>setError(e.message))},[]);
 async function connect(id:string){setError('');try{const result=await api<{url:string}>('/bot/masters/'+id+'/link',{method:'POST'});setLinks(v=>({...v,[id]:result.url}))}catch(e){setError(e instanceof Error?e.message:'Ошибка подключения')}}
 async function connectGroup(id:string){setGroupBusy(id);setError('');try{const r=await api<{command:string}>(`/bot/masters/${id}/group/link`,{method:'POST'});setCommands(v=>({...v,[id]:r.command}))}catch(e){setError(e instanceof Error?e.message:'Ошибка подключения')}finally{setGroupBusy('')}}
 async function disconnectGroup(id:string){setGroupBusy(id);setError('');try{await api(`/bot/masters/${id}/group/disconnect`,{method:'POST'});setCommands(v=>({...v,[id]:''}));await load()}catch(e){setError(e instanceof Error?e.message:'Ошибка отключения')}finally{setGroupBusy('')}}
 async function archive(id:string){if(!window.confirm('Убрать мастера? Его открытым заявкам понадобится новый исполнитель.'))return;setError('');try{await api('/masters/'+id+'/deactivate',{method:'POST'});await load()}catch(e){setError(e instanceof Error?e.message:'Ошибка')}}
 async function add(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await api('/masters'+(editId?'/'+editId:''),{method:editId?'PATCH':'POST',body:JSON.stringify({fullName:name.trim(),phone,address,cityId:getStoredUser()?.cityId||undefined})});setName('');setPhone('');setAddress('');setEditId('');setShowForm(false);await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить')}finally{setBusy(false)}}
 return <div className={`${styles.page} ${styles.mastersPage}`}>
 <div className={styles.masterPageHead}><h1 className="page-title">Мастера</h1><button type="button" className={`btn ${styles.mobileAdd}`} onClick={()=>{setShowForm(v=>!v);setEditId('');setName('');setPhone('');setAddress('')}}>{showForm?'Закрыть':'Добавить'}</button></div>
 <form className={`panel ${styles.form} ${styles.masterForm} ${showForm?styles.formOpen:''}`} onSubmit={add}>
 <h2>{editId?'Редактировать мастера':'Добавить мастера'}</h2>
 <div className={`${styles.fields} ${styles.masterFields}`}>
 <div className="field"><label htmlFor="master-name">Имя</label><input id="master-name" required autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></div>
 <div className="field"><label htmlFor="master-phone">Телефон</label><input id="master-phone" type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></div>
 <div className="field"><label htmlFor="master-address">Адрес</label><input id="master-address" autoComplete="street-address" value={address} onChange={e=>setAddress(e.target.value)}/></div>
 </div><div className={styles.actions}><button className="btn" disabled={busy||!name.trim()}>{busy?'Сохраняем…':editId?'Сохранить':'Добавить мастера'}</button>
 {editId&&<button type="button" className="btn secondary" onClick={()=>{setEditId('');setShowForm(false);setName('');setPhone('');setAddress('')}}>Отмена</button>}</div></form>
 {error&&<p className="error" role="alert">{error}</p>}
 <div className={styles.sectionHead}><h2>В списке <span className={styles.count}>{masters.length}</span></h2><button className="btn secondary" onClick={()=>load().catch(e=>setError(e.message))}>Обновить</button></div>
 {!masters.length&&!error&&<div className={`panel ${styles.empty}`}>Мастеров пока нет</div>}
 <div className={styles.cards}>{masters.map(m=>{const active=orders.filter(o=>o.masterId===m.id&&!['DONE','REFUSAL','CANCELLED_CC'].includes(o.status));return <section className={`panel ${styles.card} ${styles.masterCard}`} key={m.id}>
 <div className={styles.masterHead}><span className={styles.avatar} aria-hidden="true">{m.user.fullName.trim().slice(0,1).toUpperCase()}</span><div><h3>{m.user.fullName}</h3>{m.user.phone&&<a href={'tel:'+m.user.phone}>{formatRuPhoneDisplay(m.user.phone)}</a>}</div><span className={styles.count}>{active.length} в работе</span></div>
 {active.length>0&&<MobileFold title={`Открыть заявки · ${active.length}`} className={styles.masterJobs}><div className={styles.jobs}>{active.map(o=><Link key={o.id} href={'/orders/'+o.id}><span>№ {o.publicId}</span><strong>{o.client.name}</strong><span aria-hidden="true">›</span></Link>)}</div></MobileFold>}
 <MobileFold title="Настройки мастера" className={styles.masterSettings}>
 {m.address&&<p className={styles.address}>{m.address}</p>}
 <div className={styles.telegram}><span className={groups[m.id]?styles.connected:styles.disconnected}>{groups[m.id]?'Группа: '+groups[m.id]!.title:'Группа для заявок не подключена'}</span><button className="btn secondary" disabled={groupBusy===m.id} onClick={()=>connectGroup(m.id)}>{groups[m.id]?'Сменить группу':'Подключить группу'}</button>{groups[m.id]&&<button className="btn secondary" disabled={groupBusy===m.id} onClick={()=>disconnectGroup(m.id)}>Отключить группу</button>}</div>
 {commands[m.id]&&<div className={styles.linkBox}><label htmlFor={'group-'+m.id}>Добавьте бота в группу мастера и отправьте туда эту команду от администратора группы.</label><input id={'group-'+m.id} readOnly value={commands[m.id]} onFocus={e=>e.target.select()}/><button className="btn secondary" onClick={async()=>{try{await navigator.clipboard.writeText(commands[m.id])}catch{window.prompt('Команда для группы',commands[m.id])}}}>Скопировать команду</button><button className="btn secondary" onClick={()=>load().catch(e=>setError(e.message))}>Проверить подключение</button></div>}
 <div className={styles.telegram}><span className={m.user.telegramId?styles.connected:styles.disconnected}>Личный Telegram {m.user.telegramId?'подключён':'не подключён'}</span><button className="btn secondary" onClick={()=>connect(m.id)}>{m.user.telegramId?'Переподключить':'Подключить'}</button></div>
 {links[m.id]&&<div className={styles.linkBox}><label htmlFor={'link-'+m.id}>Ссылка для мастера (на сутки)</label><input id={'link-'+m.id} readOnly value={links[m.id]} onFocus={e=>e.target.select()}/><button className="btn secondary" onClick={async()=>{try{await navigator.clipboard.writeText(links[m.id])}catch{window.prompt('Ссылка для мастера',links[m.id])}}}>Скопировать ссылку</button></div>}
 <div className={styles.footer}><button className="btn secondary" onClick={()=>{setShowForm(true);setEditId(m.id);setName(m.user.fullName);setPhone(m.user.phone||'');setAddress(m.address||'');window.scrollTo({top:0,behavior:'smooth'})}}>Изменить</button><button className={styles.remove} onClick={()=>archive(m.id)}>Убрать из активных</button></div>
 </MobileFold>
 </section>})}</div></div>
}
