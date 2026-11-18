'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import styles from './reports.module.css';
type Order={isPersonal?:boolean;id:string;status:string;completedAt?:string;typeTech?:string;masterId?:string;master?:{user:{fullName:string}};payment?:{paid:string;partsCost:string;masterSalary:string;toCompany:string;reinvestAmount:string;ownerNet:string}};
type Master={id:string;user:{fullName:string}};
const moscowDate=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const monthEnd=()=>{const [year,month]=moscowDate().split('-').map(Number);return new Date(Date.UTC(year,month,0)).toISOString().slice(0,10)};
const money=(n:number)=>n.toLocaleString('ru-RU',{style:'currency',currency:'RUB'});
function totals(rows:Order[]){return rows.reduce((a,o)=>({count:a.count+1,paid:a.paid+Number(o.payment?.paid||0),parts:a.parts+Number(o.payment?.partsCost||0),salary:a.salary+Number(o.payment?.masterSalary||0),owner:a.owner+Number(o.payment?.ownerNet??o.payment?.toCompany??0),reinvest:a.reinvest+Number(o.payment?.reinvestAmount||0)}),{count:0,paid:0,parts:0,salary:0,owner:0,reinvest:0})}
export default function ReportsPage(){
 const [orders,setOrders]=useState<Order[]>([]);const [masters,setMasters]=useState<Master[]>([]);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 const [from,setFrom]=useState(()=>moscowDate().slice(0,7)+'-01');const [to,setTo]=useState(monthEnd);const [allMasters,setAllMasters]=useState(false);
 function period(value:string){setFrom(value==='all'?'':value==='today'?moscowDate():moscowDate().slice(0,7)+'-01');setTo(value==='all'?'':value==='today'?moscowDate():monthEnd())}
 useEffect(()=>{Promise.all([api<Order[]>('/orders'),api<Master[]>('/masters?all=1')]).then(([o,m])=>{setOrders(o);setMasters(m)}).catch(e=>setError(e.message)).finally(()=>setLoading(false))},[]);
 const rows=orders.filter(o=>{if(o.status!=='DONE'||!o.completedAt)return false;const date=moscowDate(new Date(o.completedAt));return (!from||date>=from)&&(!to||date<=to)});const total=totals(rows);
 const masterRows=[...masters.map(m=>({id:m.id,name:m.user.fullName})),...(rows.some(o=>!o.masterId)?[{id:'',name:'Личные / без мастера'}]:[])];
 const metrics=[['Мне после Авито',money(total.owner)],['Оплачено клиентами',money(total.paid)],['На Авито',money(total.reinvest)],['Мастерам',money(total.salary)],['Запчасти',money(total.parts)],['Средний чек',money(total.count?total.paid/total.count:0)]];
 return <div className={styles.page}>
  <div className={styles.heading}><h1 className="page-title">Финансы</h1>{!loading&&!error&&<span className={styles.count}>Закрыто заявок: {total.count}</span>}</div>
  <div className={styles.presets}>{[['today','Сегодня'],['month','Этот месяц'],['all','Всё время']].map(([value,label])=><button key={value} className={(value==='all'&&!from&&!to)||(value==='today'&&from===moscowDate()&&to===moscowDate())||(value==='month'&&from===moscowDate().slice(0,7)+'-01'&&to===monthEnd())?'btn':'btn secondary'} onClick={()=>period(value)}>{label}</button>)}</div><section className={`panel ${styles.filters}`} aria-label="Период отчёта">
   <div className="field"><label htmlFor="report-from">С даты</label><input id="report-from" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div>
   <div className="field"><label htmlFor="report-to">По дату</label><input id="report-to" type="date" min={from} value={to} onChange={e=>setTo(e.target.value)}/></div>

  </section>
  {error?<p className="error" role="alert">{error}</p>:loading?<div className="panel" role="status">Загрузка…</div>:<>
   <section className={styles.metrics} aria-label="Итоги периода">{metrics.map(([label,value],i)=><div key={label} className={`${styles.metric} ${i===0?styles.highlight:''}`}><span>{label}</span><strong>{value}</strong></div>)}</section>
   <section className={styles.section}><div className={styles.heading}><h2>По мастерам</h2><button className="btn secondary" aria-pressed={allMasters} onClick={()=>setAllMasters(!allMasters)}>{allMasters?'Скрыть без заявок':'Все мастера'}</button></div><div className={styles.masters}>{masterRows.filter(m=>allMasters||rows.some(o=>(o.masterId||'')===m.id)).map(m=>{const t=totals(rows.filter(o=>(o.masterId||'')===m.id));return <article className={styles.master} key={m.id}><header><h3>{m.name}</h3><span className={styles.count}>Закрыто: {t.count}</span></header><dl className={styles.details}>{[['Сумма заказов',money(t.paid)],['Средний чек',money(t.count?t.paid/t.count:0)],['Запчасти',money(t.parts)],['Мастеру',money(t.salary)],['На Авито',money(t.reinvest)],['Мне',money(t.owner)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article>})}</div>{!rows.length&&!allMasters&&<p className={styles.empty}>Нет закрытых заявок за период.</p>}</section>
   <section className={styles.section}><h2>По технике</h2>{!rows.length?<p className={styles.empty}>За этот период закрытых заявок нет.</p>:<div className={styles.techList}>{[...new Set(rows.map(o=>o.typeTech?.trim()||'Не указана'))].map(type=>{const t=totals(rows.filter(o=>(o.typeTech?.trim()||'Не указана')===type));return <article className={styles.tech} key={type}><div><h3>{type}</h3><span>Заявок: {t.count}</span></div><dl><div><dt>Сумма заказов</dt><dd>{money(t.paid)}</dd></div><div><dt>Средний чек</dt><dd>{money(t.count?t.paid/t.count:0)}</dd></div></dl></article>})}</div>}</section>
  </>}
 </div>
}
