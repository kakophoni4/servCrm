'use client';
import Link from 'next/link';
import {MasterAccess} from '@/components/master/MasterAccess';
import {WorkSchedule,currentWeek,moscowDate} from '@/components/masters/WorkSchedule';
import layout from '@/components/masters/MastersLayout.module.css';
import {DeskShell} from '@/components/desk/DeskShell';
import {STATUS_LABELS} from '@/lib/labels';
import {TECH} from '@/components/TechPicker';
import {MasterCash,CashBalance} from '@/components/masters/MasterCash';
import { formatRuPhoneDisplay, phoneHref } from '@/lib/phone';
import styles from '@/components/settings/OwnerPanels.module.css';
import { FormEvent, useEffect, useState, useCallback, useRef } from 'react';
import { api, getStoredUser } from '@/lib/api';
type Master = {id:string;activity?:string;workSchedule?:{weekday:number;isWorking:boolean}[];activeCount:number;sdCount:number;averageCheck:number;completedOrders:number;repairTech?:string[];address?:string; user:{telegramId?:string|null;fullName:string;phone?:string|null}};
type Order = {id:string;publicId:string;masterId?:string;status:string;address:string;scheduledAt?:string|null;sdDueAt?:string|null;client:{name:string}};
export default function MastersPage(){
 const dates=currentWeek();
 const [currentUser,setCurrentUser]=useState<ReturnType<typeof getStoredUser>>(null);
 useEffect(()=>setCurrentUser(getStoredUser()),[]);
 const owner=currentUser?.role==='OWNER';
 const logistic=currentUser?.permissions?.includes('staff.logistic');
 const [techFilter,setTechFilter]=useState('');const [query,setQuery]=useState('');const [page,setPage]=useState(1);const [total,setTotal]=useState(0);const [totalPages,setTotalPages]=useState(1);const [loading,setLoading]=useState(false);const generation=useRef(0);const [openMaster,setOpenMaster]=useState('');const [jobsMeta,setJobsMeta]=useState<Record<string,{page:number;totalPages:number}>>({});const [jobsBusy,setJobsBusy]=useState('');
 const [cash,setCash]=useState<CashBalance[]>([]);
 const [showForm,setShowForm]=useState(false);
 const [groups,setGroups]=useState<Record<string,{chatId:string;title:string}|null>>({});
 const [commands,setCommands]=useState<Record<string,string>>({});
 const [groupBusy,setGroupBusy]=useState('');
 const [links,setLinks]=useState<Record<string,string>>({});
 const [masters,setMasters]=useState<Master[]>([]);
 const [orders,setOrders]=useState<Order[]>([]);
 const schedule={error:'',days:masters.flatMap(m=>dates.flatMap(date=>{const day=new Date(date+'T12:00:00Z').getUTCDay()||7;const row=m.workSchedule?.find(r=>r.weekday===day);return row?[{masterId:m.id,date,isWorking:row.isWorking}]:[]}))};
 const [repairTech,setRepairTech]=useState<string[]>([]);
 const [address,setAddress]=useState('');const [editId,setEditId]=useState('');
 const [name,setName]=useState('');const [phone,setPhone]=useState('');
 const [notice,setNotice]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{const version=++generation.current;setLoading(true);setError('');try{const r=await api<{items:Master[];total:number;totalPages:number}>(`/masters/paged?page=${page}&limit=30&q=${encodeURIComponent(query)}&tech=${encodeURIComponent(techFilter)}`);if(version!==generation.current)return;setMasters(r.items);setTotal(r.total);setTotalPages(r.totalPages);if(page>r.totalPages)setPage(r.totalPages)}finally{if(version===generation.current)setLoading(false)}},[page,query,techFilter]);
 useEffect(()=>{const timer=setTimeout(()=>{if(currentUser)load().catch(e=>setError(e.message))},250);return()=>{clearTimeout(timer);generation.current++}},[load,currentUser]);
 async function loadJobs(id:string,p=1){setJobsBusy(id);setError('');try{const [r,c]=await Promise.all([api<{items:Order[];page:number;totalPages:number}>(`/masters/${id}/jobs?page=${p}&limit=30`),owner?api<CashBalance[]>(`/settlements/cash?masterId=${id}`):Promise.resolve([])]);setOrders(v=>[...v.filter(o=>o.masterId!==id),...r.items]);setJobsMeta(v=>({...v,[id]:{page:r.page,totalPages:r.totalPages}}));setCash(v=>[...v.filter(x=>x.masterId!==id),...c])}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить')}finally{setJobsBusy('')}}
 async function loadGroup(id:string){try{const g=await api<{chatId:string;title:string}|null>(`/bot/masters/${id}/group`);setGroups(v=>({...v,[id]:g}))}catch(e){setError(e instanceof Error?e.message:'Ошибка подключения')}}
 async function connect(id:string){setError('');try{const result=await api<{url:string}>('/bot/masters/'+id+'/link',{method:'POST'});setLinks(v=>({...v,[id]:result.url}))}catch(e){setError(e instanceof Error?e.message:'Ошибка подключения')}}
 async function connectGroup(id:string){setGroupBusy(id);setError('');try{const r=await api<{command:string}>(`/bot/masters/${id}/group/link`,{method:'POST'});setCommands(v=>({...v,[id]:r.command}))}catch(e){setError(e instanceof Error?e.message:'Ошибка подключения')}finally{setGroupBusy('')}}
 async function disconnectGroup(id:string){setGroupBusy(id);setError('');try{await api(`/bot/masters/${id}/group/disconnect`,{method:'POST'});setCommands(v=>({...v,[id]:''}));await loadGroup(id)}catch(e){setError(e instanceof Error?e.message:'Ошибка отключения')}finally{setGroupBusy('')}}
 async function archive(id:string){if(!window.confirm('Убрать мастера? Его открытым заявкам понадобится новый исполнитель.'))return;setError('');try{await api('/masters/'+id+'/deactivate',{method:'POST'});await load()}catch(e){setError(e instanceof Error?e.message:'Ошибка')}}
 async function add(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await api('/masters'+(editId?'/'+editId:''),{method:editId?'PATCH':'POST',body:JSON.stringify({fullName:name.trim(),phone,address,repairTech,cityId:getStoredUser()?.cityId||undefined})});setName('');setPhone('');setAddress('');setRepairTech([]);setEditId('');setShowForm(false);await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить')}finally{setBusy(false)}}
 return <DeskShell action={owner&&<button type="button" className={`btn ${styles.mobileAdd}`} onClick={()=>{setShowForm(v=>!v);setEditId('');setName('');setPhone('');setAddress('');setRepairTech([])}}>{showForm?'Закрыть':'Добавить'}</button>}><div className={`${styles.page} ${styles.mastersPage} ${layout.page}`}>

 {owner&&<form className={`panel ${styles.form} ${styles.masterForm} ${showForm?styles.formOpen:''}`} onSubmit={add}>
 <h2>{editId?'Редактировать мастера':'Добавить мастера'}</h2>
 <div className={`${styles.fields} ${styles.masterFields}`}>
 <div className="field"><label htmlFor="master-name">Имя</label><input id="master-name" required autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></div>
 <div className="field"><label htmlFor="master-phone">Телефон</label><input id="master-phone" type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></div>
 <div className="field"><label htmlFor="master-address">Адрес</label><input id="master-address" autoComplete="street-address" value={address} onChange={e=>setAddress(e.target.value)}/></div>
 </div><fieldset className={styles.masterTechField}><legend>Что ремонтирует</legend><div className="tech-picker">{TECH.map(([code,label])=><button key={code} type="button" title={label} aria-label={label} aria-pressed={repairTech.includes(code)} className={repairTech.includes(code)?'btn':'btn secondary'} onClick={()=>setRepairTech(v=>v.includes(code)?v.filter(x=>x!==code):[...v,code])}>{code}</button>)}</div></fieldset><div className={styles.actions}><button className="btn" disabled={busy||!name.trim()}>{busy?'Сохраняем…':editId?'Сохранить':'Добавить мастера'}</button>
 {editId&&<button type="button" className="btn secondary" onClick={()=>{setEditId('');setShowForm(false);setName('');setPhone('');setAddress('');setRepairTech([])}}>Отмена</button>}</div></form>}
 <div className={layout.toolbar}><input aria-label="Поиск мастеров" placeholder="Имя или телефон" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);setOpenMaster('')}}/><select aria-label="Техника мастера" value={techFilter} onChange={e=>{setTechFilter(e.target.value);setPage(1);setOpenMaster('')}}><option value="">Вся техника</option>{TECH.map(([code,label])=><option key={code} value={code}>{code} - {label}</option>)}</select></div>
 {notice&&<p role="status">{notice}</p>}
 {schedule.error&&<p className="error">{schedule.error}</p>}
 {error&&<p className="error" role="alert">{error}</p>}
 <div className={styles.sectionHead}><h2>В списке <span className={styles.count}>{total}</span></h2><button className="btn secondary" onClick={()=>load().catch(e=>setError(e.message))}>Обновить</button></div>
 {!loading&&!masters.length&&!error&&<div className={`panel ${styles.empty}`}>Мастеров пока нет</div>}
 <div className={`${styles.cards} ${layout.grid}`}>{masters.map((m,index)=>{const working=schedule.days.find(d=>d.masterId===m.id&&d.date===moscowDate())?.isWorking;const previous=index>0?schedule.days.find(d=>d.masterId===masters[index-1].id&&d.date===moscowDate())?.isWorking:null;const active=orders.filter(o=>o.masterId===m.id&&!['DONE','REFUSAL','CANCELLED_CC'].includes(o.status));return <section style={{borderTop:working!==previous?'3px solid var(--line)':undefined}} className={`panel ${styles.card} ${styles.masterCard} ${layout.card}`} key={m.id}>
 <div className={`${styles.masterHead} ${layout.identity}`}><span className={styles.avatar} aria-hidden="true">{m.user.fullName.trim().slice(0,1).toUpperCase()}</span><div><h3>{m.user.fullName}</h3>{m.user.phone&&<a href={phoneHref(m.user.phone)}>{formatRuPhoneDisplay(m.user.phone)}</a>}</div><span className={styles.count}>{m.activeCount} в работе · СД {m.sdCount}</span></div>
 <div style={{color:schedule.days.find(d=>d.masterId===m.id&&d.date===moscowDate())?.isWorking===false?"var(--muted)":"var(--ink)"}}>{working===true?'✅ В смене':working===false?'❌ Выходной':'График не задан'} · {m.activity||'Статус не указан'}</div>
 {!logistic&&<div style={{display:'flex',flexWrap:'wrap',gap:'4px 12px',marginTop:8}}><span>Средний чек <strong>{(m.averageCheck||0).toLocaleString('ru-RU',{maximumFractionDigits:0})} ₽</strong></span><span className="muted">Закрыто {m.completedOrders||0}</span></div>}
 <div className={styles.masterTech} aria-label="Ремонтирует">{m.repairTech?.length?m.repairTech.map(code=><span className="badge" key={code} title={TECH.find(([key])=>key===code)?.[1]||code}>{code}</span>):<span className="muted">Техника не указана</span>}</div>

 <details open={openMaster===m.id} onToggle={e=>{if(e.currentTarget.open&&openMaster!==m.id){setOpenMaster(m.id);void loadJobs(m.id)}else if(!e.currentTarget.open&&openMaster===m.id)setOpenMaster('')}}><summary style={{cursor:'pointer',padding:'8px 0',fontWeight:600}}>Заявки, график и касса</summary><WorkSchedule masterId={m.id} days={schedule.days} dates={dates}/>{jobsBusy===m.id&&<p>Загрузка...</p>}
 {cash.find(c=>c.masterId===m.id)&&<MasterCash balance={cash.find(c=>c.masterId===m.id)!} onSaved={async()=>{await loadJobs(m.id,jobsMeta[m.id]?.page||1);await load()}}/>}
 <div className={styles.masterJobs}>
 {!active.length?<p className="muted">Нет актуальных заявок</p>:['regular','sd'].map(group=>{const rows=active.filter(o=>(o.status==='IN_PROGRESS_SD')===(group==='sd')).sort((a,b)=>(a.scheduledAt||'9999').localeCompare(b.scheduledAt||'9999'));return rows.length>0&&<div key={group}><h4>{group==='sd'?'СД':'Назначены и в работе'} · {rows.length}</h4><div style={{display:'grid',gap:8}}>{rows.map(o=><Link key={o.id} href={'/orders/'+o.id} style={{display:'grid',gap:4,padding:'10px 0',borderBottom:'1px solid var(--border)',overflowWrap:'anywhere'}}><strong>№ {o.publicId} · {o.client.name}</strong><span>{o.address}</span><span className="muted">{STATUS_LABELS[o.status]||o.status} · {o.scheduledAt?new Date(o.scheduledAt).toLocaleString('ru-RU',{timeZone:'Europe/Samara',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Время не назначено'}</span>{group==='sd'&&<span>Срок СД: {o.sdDueAt?new Date(o.sdDueAt).toLocaleDateString('ru-RU',{timeZone:'Europe/Samara'}):'не указан'}{o.sdDueAt&&new Date(o.sdDueAt)<new Date()?' · просрочено':''}</span>}</Link>)}</div></div>})}
 </div>
 {jobsMeta[m.id]&&jobsMeta[m.id].totalPages>1&&<div className={layout.pager}><button className="btn secondary" disabled={jobsBusy===m.id||jobsMeta[m.id].page<=1} onClick={()=>loadJobs(m.id,jobsMeta[m.id].page-1)}>Назад</button><span>{jobsMeta[m.id].page} / {jobsMeta[m.id].totalPages}</span><button className="btn secondary" disabled={jobsBusy===m.id||jobsMeta[m.id].page>=jobsMeta[m.id].totalPages} onClick={()=>loadJobs(m.id,jobsMeta[m.id].page+1)}>Далее</button></div>}
 </details>

 {owner&&<details className={styles.masterSettings} onToggle={e=>{if(e.currentTarget.open)void loadGroup(m.id)}}><summary>Настройки мастера</summary><button className="btn secondary" onClick={async()=>{const confirmation=window.prompt(`Удалить мастера ${m.user.fullName}? Введите его имя для подтверждения.`);if(confirmation===null)return;setError('');try{await api('/masters/'+m.id,{method:'DELETE',body:JSON.stringify({confirmation})});await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось удалить')}}}>Удалить пустую карточку мастера</button><MasterAccess id={m.id}/><button type="button" className="btn secondary" disabled={groupBusy===m.id} onClick={async()=>{setGroupBusy(m.id);setError('');try{await api(`/bot/masters/${m.id}/schedule-request`,{method:'POST'});setNotice('Запрос графика отправлен мастеру')}catch(e){setError(e instanceof Error?e.message:'Не удалось отправить запрос')}finally{setGroupBusy('')}}}>Запросить график в Telegram</button>
 {m.address&&<p className={styles.address}>{m.address}</p>}
 <div className={styles.telegram}><span className={groups[m.id]?styles.connected:styles.disconnected}>{groups[m.id]?'Группа: '+groups[m.id]!.title:'Группа для заявок не подключена'}</span><button className="btn secondary" disabled={groupBusy===m.id} onClick={()=>connectGroup(m.id)}>{groups[m.id]?'Сменить группу':'Подключить группу'}</button>{groups[m.id]&&<button className="btn secondary" disabled={groupBusy===m.id} onClick={()=>disconnectGroup(m.id)}>Отключить группу</button>}</div>
 {commands[m.id]&&<div className={styles.linkBox}><label htmlFor={'group-'+m.id}>Добавьте бота в группу мастера и отправьте туда эту команду от администратора группы.</label><input id={'group-'+m.id} readOnly value={commands[m.id]} onFocus={e=>e.target.select()}/><button className="btn secondary" onClick={async()=>{try{await navigator.clipboard.writeText(commands[m.id])}catch{window.prompt('Команда для группы',commands[m.id])}}}>Скопировать команду</button><button className="btn secondary" onClick={()=>loadGroup(m.id)}>Проверить подключение</button></div>}
 <div className={styles.telegram}><span className={m.user.telegramId?styles.connected:styles.disconnected}>Личный Telegram {m.user.telegramId?'подключён':'не подключён'}</span><button className="btn secondary" onClick={()=>connect(m.id)}>{m.user.telegramId?'Переподключить':'Подключить'}</button></div>
 {links[m.id]&&<div className={styles.linkBox}><label htmlFor={'link-'+m.id}>Ссылка для мастера (на сутки)</label><input id={'link-'+m.id} readOnly value={links[m.id]} onFocus={e=>e.target.select()}/><button className="btn secondary" onClick={async()=>{try{await navigator.clipboard.writeText(links[m.id])}catch{window.prompt('Ссылка для мастера',links[m.id])}}}>Скопировать ссылку</button></div>}
 <div className={styles.footer}><button className="btn secondary" onClick={()=>{setShowForm(true);setEditId(m.id);setName(m.user.fullName);setPhone(m.user.phone||'');setAddress(m.address||'');setRepairTech(m.repairTech||[]);window.scrollTo({top:0,behavior:'smooth'})}}>Изменить</button><button className={styles.remove} onClick={()=>archive(m.id)}>Убрать из активных</button></div>
 </details>}
 </section>})}</div>{loading&&<p role="status">Загрузка...</p>}<div className={layout.pager}><button className="btn secondary" disabled={loading||page<=1} onClick={()=>{setPage(page-1);setOpenMaster('')}}>Назад</button><span>{page} / {totalPages} · Всего {total}</span><button className="btn secondary" disabled={loading||page>=totalPages} onClick={()=>{setPage(page+1);setOpenMaster('')}}>Далее</button></div></div></DeskShell>
}
