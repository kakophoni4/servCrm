'use client';
import Link from 'next/link';
import layout from '@/components/masters/MastersLayout.module.css';
import {DeskShell} from '@/components/desk/DeskShell';
import {STATUS_LABELS} from '@/lib/labels';
import {TECH} from '@/components/TechPicker';
import {MasterCash,CashBalance} from '@/components/masters/MasterCash';
import { formatRuPhoneDisplay, phoneHref } from '@/lib/phone';
import styles from '@/components/settings/OwnerPanels.module.css';
import { FormEvent, useEffect, useState, useCallback } from 'react';
import { api, getStoredUser } from '@/lib/api';
type Master = {id:string;averageCheck:number;completedOrders:number;repairTech?:string[];address?:string; user:{telegramId?:string|null;fullName:string;phone?:string|null}};
type Order = {id:string;publicId:string;masterId?:string;status:string;address:string;scheduledAt?:string|null;sdDueAt?:string|null;client:{name:string}};
export default function MastersPage(){
 const [currentUser,setCurrentUser]=useState<ReturnType<typeof getStoredUser>>(null);
 useEffect(()=>setCurrentUser(getStoredUser()),[]);
 const owner=currentUser?.role==='OWNER';
 const logistic=currentUser?.permissions?.includes('staff.logistic');
 const [techFilter,setTechFilter]=useState('');
 const [cash,setCash]=useState<CashBalance[]>([]);
 const [showForm,setShowForm]=useState(false);
 const [groups,setGroups]=useState<Record<string,{chatId:string;title:string}|null>>({});
 const [commands,setCommands]=useState<Record<string,string>>({});
 const [groupBusy,setGroupBusy]=useState('');
 const [links,setLinks]=useState<Record<string,string>>({});
 const [masters,setMasters]=useState<Master[]>([]);
 const [orders,setOrders]=useState<Order[]>([]);
 const [repairTech,setRepairTech]=useState<string[]>([]);
 const [address,setAddress]=useState('');const [editId,setEditId]=useState('');
 const [name,setName]=useState('');const [phone,setPhone]=useState('');
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{const [m,o,c]=await Promise.all([api<Master[]>('/masters'),api<Order[]>('/orders'),owner?api<CashBalance[]>('/settlements/cash'):Promise.resolve([])]);setMasters(m);setOrders(o);setCash(c);if(!owner)return;const g=await Promise.all(m.map(async x=>[x.id,await api<{chatId:string;title:string}|null>(`/bot/masters/${x.id}/group`)] as const));setGroups(Object.fromEntries(g))},[owner]);
 useEffect(()=>{if(currentUser)load().catch(e=>setError(e.message))},[load,currentUser]);
 async function connect(id:string){setError('');try{const result=await api<{url:string}>('/bot/masters/'+id+'/link',{method:'POST'});setLinks(v=>({...v,[id]:result.url}))}catch(e){setError(e instanceof Error?e.message:'Ошибка подключения')}}
 async function connectGroup(id:string){setGroupBusy(id);setError('');try{const r=await api<{command:string}>(`/bot/masters/${id}/group/link`,{method:'POST'});setCommands(v=>({...v,[id]:r.command}))}catch(e){setError(e instanceof Error?e.message:'Ошибка подключения')}finally{setGroupBusy('')}}
 async function disconnectGroup(id:string){setGroupBusy(id);setError('');try{await api(`/bot/masters/${id}/group/disconnect`,{method:'POST'});setCommands(v=>({...v,[id]:''}));await load()}catch(e){setError(e instanceof Error?e.message:'Ошибка отключения')}finally{setGroupBusy('')}}
 async function archive(id:string){if(!window.confirm('Убрать мастера? Его открытым заявкам понадобится новый исполнитель.'))return;setError('');try{await api('/masters/'+id+'/deactivate',{method:'POST'});await load()}catch(e){setError(e instanceof Error?e.message:'Ошибка')}}
 async function add(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await api('/masters'+(editId?'/'+editId:''),{method:editId?'PATCH':'POST',body:JSON.stringify({fullName:name.trim(),phone,address,repairTech,cityId:getStoredUser()?.cityId||undefined})});setName('');setPhone('');setAddress('');setRepairTech([]);setEditId('');setShowForm(false);await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить')}finally{setBusy(false)}}
 return <DeskShell><div className={`${styles.page} ${styles.mastersPage} ${layout.page}`}>
 <div className={styles.masterPageHead}>{owner&&<button type="button" className={`btn ${styles.mobileAdd}`} onClick={()=>{setShowForm(v=>!v);setEditId('');setName('');setPhone('');setAddress('');setRepairTech([])}}>{showForm?'Закрыть':'Добавить'}</button>}</div>
 {owner&&<form className={`panel ${styles.form} ${styles.masterForm} ${showForm?styles.formOpen:''}`} onSubmit={add}>
 <h2>{editId?'Редактировать мастера':'Добавить мастера'}</h2>
 <div className={`${styles.fields} ${styles.masterFields}`}>
 <div className="field"><label htmlFor="master-name">Имя</label><input id="master-name" required autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></div>
 <div className="field"><label htmlFor="master-phone">Телефон</label><input id="master-phone" type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></div>
 <div className="field"><label htmlFor="master-address">Адрес</label><input id="master-address" autoComplete="street-address" value={address} onChange={e=>setAddress(e.target.value)}/></div>
 </div><fieldset className={styles.masterTechField}><legend>Что ремонтирует</legend><div className="tech-picker">{TECH.map(([code,label])=><button key={code} type="button" title={label} aria-label={label} aria-pressed={repairTech.includes(code)} className={repairTech.includes(code)?'btn':'btn secondary'} onClick={()=>setRepairTech(v=>v.includes(code)?v.filter(x=>x!==code):[...v,code])}>{code}</button>)}</div></fieldset><div className={styles.actions}><button className="btn" disabled={busy||!name.trim()}>{busy?'Сохраняем…':editId?'Сохранить':'Добавить мастера'}</button>
 {editId&&<button type="button" className="btn secondary" onClick={()=>{setEditId('');setShowForm(false);setName('');setPhone('');setAddress('');setRepairTech([])}}>Отмена</button>}</div></form>}
 {!logistic&&<p className="muted">По среднему чеку · за всё время</p>}
 <div className="tech-picker" aria-label="Фильтр по технике">{[['','Все'],...TECH].map(([code,label])=><button type="button" key={code} title={label} aria-pressed={techFilter===code} className={techFilter===code?'btn':'btn secondary'} onClick={()=>setTechFilter(code)}>{code||'Все'}</button>)}</div>
 {error&&<p className="error" role="alert">{error}</p>}
 <div className={styles.sectionHead}><h2>В списке <span className={styles.count}>{masters.filter(m=>!techFilter||m.repairTech?.includes(techFilter)).length}</span></h2><button className="btn secondary" onClick={()=>load().catch(e=>setError(e.message))}>Обновить</button></div>
 {!masters.length&&!error&&<div className={`panel ${styles.empty}`}>Мастеров пока нет</div>}
 <div className={`${styles.cards} ${layout.grid}`}>{masters.filter(m=>!techFilter||m.repairTech?.includes(techFilter)).map(m=>{const active=orders.filter(o=>o.masterId===m.id&&!['DONE','REFUSAL','CANCELLED_CC'].includes(o.status));return <section className={`panel ${styles.card} ${styles.masterCard} ${layout.card}`} key={m.id}>
 <div className={`${styles.masterHead} ${layout.identity}`}><span className={styles.avatar} aria-hidden="true">{m.user.fullName.trim().slice(0,1).toUpperCase()}</span><div><h3>{m.user.fullName}</h3>{m.user.phone&&<a href={phoneHref(m.user.phone)}>{formatRuPhoneDisplay(m.user.phone)}</a>}</div><span className={styles.count}>{active.filter(o=>o.status!=='IN_PROGRESS_SD').length} в работе · СД {active.filter(o=>o.status==='IN_PROGRESS_SD').length}</span></div>
 {!logistic&&<div style={{display:'flex',flexWrap:'wrap',gap:'4px 12px',marginTop:8}}><span>Средний чек <strong>{(m.averageCheck||0).toLocaleString('ru-RU',{maximumFractionDigits:0})} ₽</strong></span><span className="muted">Закрыто {m.completedOrders||0}</span></div>}
 <div className={styles.masterTech} aria-label="Ремонтирует">{m.repairTech?.length?m.repairTech.map(code=><span className="badge" key={code} title={TECH.find(([key])=>key===code)?.[1]||code}>{code}</span>):<span className="muted">Техника не указана</span>}</div>
 {owner&&<div style={{marginTop:8}}>К сдаче <strong>{(cash.find(c=>c.masterId===m.id)?.remaining||0).toLocaleString('ru-RU')} ₽</strong></div>}
 <details style={{marginTop:12}}><summary style={{cursor:'pointer',padding:'8px 0',fontWeight:600}}>Заявки и касса</summary>
 {cash.find(c=>c.masterId===m.id)&&<MasterCash balance={cash.find(c=>c.masterId===m.id)!} onSaved={load}/>}
 <div className={styles.masterJobs}>
 {!active.length?<p className="muted">Нет актуальных заявок</p>:['regular','sd'].map(group=>{const rows=active.filter(o=>(o.status==='IN_PROGRESS_SD')===(group==='sd')).sort((a,b)=>(a.scheduledAt||'9999').localeCompare(b.scheduledAt||'9999'));return rows.length>0&&<div key={group}><h4>{group==='sd'?'СД':'Назначены и в работе'} · {rows.length}</h4><div style={{display:'grid',gap:8}}>{rows.map(o=><Link key={o.id} href={'/orders/'+o.id} style={{display:'grid',gap:4,padding:'10px 0',borderBottom:'1px solid var(--border)',overflowWrap:'anywhere'}}><strong>№ {o.publicId} · {o.client.name}</strong><span>{o.address}</span><span className="muted">{STATUS_LABELS[o.status]||o.status} · {o.scheduledAt?new Date(o.scheduledAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Время не назначено'}</span>{group==='sd'&&<span>Срок СД: {o.sdDueAt?new Date(o.sdDueAt).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'}):'не указан'}{o.sdDueAt&&new Date(o.sdDueAt)<new Date()?' · просрочено':''}</span>}</Link>)}</div></div>})}
 </div>
 </details>
 {owner&&<details className={styles.masterSettings}><summary>Настройки мастера</summary>
 {m.address&&<p className={styles.address}>{m.address}</p>}
 <div className={styles.telegram}><span className={groups[m.id]?styles.connected:styles.disconnected}>{groups[m.id]?'Группа: '+groups[m.id]!.title:'Группа для заявок не подключена'}</span><button className="btn secondary" disabled={groupBusy===m.id} onClick={()=>connectGroup(m.id)}>{groups[m.id]?'Сменить группу':'Подключить группу'}</button>{groups[m.id]&&<button className="btn secondary" disabled={groupBusy===m.id} onClick={()=>disconnectGroup(m.id)}>Отключить группу</button>}</div>
 {commands[m.id]&&<div className={styles.linkBox}><label htmlFor={'group-'+m.id}>Добавьте бота в группу мастера и отправьте туда эту команду от администратора группы.</label><input id={'group-'+m.id} readOnly value={commands[m.id]} onFocus={e=>e.target.select()}/><button className="btn secondary" onClick={async()=>{try{await navigator.clipboard.writeText(commands[m.id])}catch{window.prompt('Команда для группы',commands[m.id])}}}>Скопировать команду</button><button className="btn secondary" onClick={()=>load().catch(e=>setError(e.message))}>Проверить подключение</button></div>}
 <div className={styles.telegram}><span className={m.user.telegramId?styles.connected:styles.disconnected}>Личный Telegram {m.user.telegramId?'подключён':'не подключён'}</span><button className="btn secondary" onClick={()=>connect(m.id)}>{m.user.telegramId?'Переподключить':'Подключить'}</button></div>
 {links[m.id]&&<div className={styles.linkBox}><label htmlFor={'link-'+m.id}>Ссылка для мастера (на сутки)</label><input id={'link-'+m.id} readOnly value={links[m.id]} onFocus={e=>e.target.select()}/><button className="btn secondary" onClick={async()=>{try{await navigator.clipboard.writeText(links[m.id])}catch{window.prompt('Ссылка для мастера',links[m.id])}}}>Скопировать ссылку</button></div>}
 <div className={styles.footer}><button className="btn secondary" onClick={()=>{setShowForm(true);setEditId(m.id);setName(m.user.fullName);setPhone(m.user.phone||'');setAddress(m.address||'');setRepairTech(m.repairTech||[]);window.scrollTo({top:0,behavior:'smooth'})}}>Изменить</button><button className={styles.remove} onClick={()=>archive(m.id)}>Убрать из активных</button></div>
 </details>}
 </section>})}</div></div></DeskShell>
}
