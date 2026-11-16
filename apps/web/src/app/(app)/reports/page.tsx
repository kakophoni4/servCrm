'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import styles from './reports.module.css';
type Order={isPersonal?:boolean;id:string;status:string;completedAt?:string;typeTech?:string;masterId?:string;master?:{user:{fullName:string}};payment?:{paid:string;partsCost:string;masterSalary:string;toCompany:string;reinvestAmount:string;ownerNet:string}};
type Master={id:string;user:{fullName:string}};
const money=(n:number)=>n.toLocaleString('ru-RU',{style:'currency',currency:'RUB'});
function totals(rows:Order[]){return rows.reduce((a,o)=>({count:a.count+1,paid:a.paid+Number(o.payment?.paid||0),parts:a.parts+Number(o.payment?.partsCost||0),salary:a.salary+Number(o.payment?.masterSalary||0),owner:a.owner+Number(o.payment?.ownerNet??o.payment?.toCompany??0),reinvest:a.reinvest+Number(o.payment?.reinvestAmount||0)}),{count:0,paid:0,parts:0,salary:0,owner:0,reinvest:0})}
export default function ReportsPage(){
 const [orders,setOrders]=useState<Order[]>([]);const [masters,setMasters]=useState<Master[]>([]);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 const [from,setFrom]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`});const [to,setTo]=useState('');
 useEffect(()=>{Promise.all([api<Order[]>('/orders'),api<Master[]>('/masters?all=1')]).then(([o,m])=>{setOrders(o);setMasters(m)}).catch(e=>setError(e.message)).finally(()=>setLoading(false))},[]);
 const rows=orders.filter(o=>{if(o.status!=='DONE'||!o.completedAt)return false;const date=new Date(o.completedAt);return (!from||date>=new Date(from+'T00:00:00'))&&(!to||date<new Date(new Date(to+'T00:00:00').setDate(new Date(to+'T00:00:00').getDate()+1)))});const total=totals(rows);
 const masterRows=[...masters.map(m=>({id:m.id,name:m.user.fullName})),...(rows.some(o=>!o.masterId)?[{id:'',name:'Личные / без мастера'}]:[])];
 const metrics=[['Оплачено клиентами',money(total.paid)],['Мне после Авито',money(total.owner)],['На Авито',money(total.reinvest)],['Мастерам',money(total.salary)],['Запчасти',money(total.parts)],['Средний чек',money(total.count?total.paid/total.count:0)]];
 return <div className={styles.page}>
  <div className={styles.heading}><h1 className="page-title">Финансы</h1>{!loading&&!error&&<span className={styles.count}>Закрыто заявок: {total.count}</span>}</div>
  <section className={`panel ${styles.filters}`} aria-label="Период отчёта">
   <div className="field"><label htmlFor="report-from">С даты</label><input id="report-from" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div>
   <div className="field"><label htmlFor="report-to">По дату</label><input id="report-to" type="date" min={from} value={to} onChange={e=>setTo(e.target.value)}/></div>
   <button className="btn secondary" onClick={()=>{setFrom('');setTo('')}}>За всё время</button>
  </section>
  {error?<p className="error" role="alert">{error}</p>:loading?<div className="panel" role="status">Загрузка…</div>:<>
   <section className={styles.metrics} aria-label="Итоги периода">{metrics.map(([label,value],i)=><div key={label} className={`${styles.metric} ${i===1?styles.highlight:''}`}><span>{label}</span><strong>{value}</strong></div>)}</section>
   <section className={styles.section}><h2>По мастерам</h2><div className={styles.masters}>{masterRows.map(m=>{const t=totals(rows.filter(o=>(o.masterId||'')===m.id));return <article className={styles.master} key={m.id}><header><h3>{m.name}</h3><span className={styles.count}>Закрыто: {t.count}</span></header><dl className={styles.details}>{[['Сумма заказов',money(t.paid)],['Средний чек',money(t.count?t.paid/t.count:0)],['Запчасти',money(t.parts)],['Мастеру',money(t.salary)],['На Авито',money(t.reinvest)],['Мне',money(t.owner)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article>})}</div>{!masterRows.length&&<p className={styles.empty}>Мастеров пока нет.</p>}</section>
   <section className={styles.section}><h2>По технике</h2>{!rows.length?<p className={styles.empty}>За этот период закрытых заявок нет.</p>:<div className={styles.techList}>{[...new Set(rows.map(o=>o.typeTech?.trim()||'Не указана'))].map(type=>{const t=totals(rows.filter(o=>(o.typeTech?.trim()||'Не указана')===type));return <article className={styles.tech} key={type}><div><h3>{type}</h3><span>Заявок: {t.count}</span></div><dl><div><dt>Сумма заказов</dt><dd>{money(t.paid)}</dd></div><div><dt>Средний чек</dt><dd>{money(t.count?t.paid/t.count:0)}</dd></div></dl></article>})}</div>}</section>
  </>}
 </div>
}
