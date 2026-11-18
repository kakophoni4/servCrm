'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
import styles from './reports.module.css';
type Totals={count:number;paid:string;parts:string;salary:string;owner:string;reinvest:string};
type Summary={channels:(Totals&{name:string})[];total:Totals;masters:(Totals&{id:string;name:string})[];tech:(Totals&{type:string})[]};
const zero:Totals={count:0,paid:'0',parts:'0',salary:'0',owner:'0',reinvest:'0'};
const moscowDate=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Samara',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const monthEnd=()=>{const [year,month]=moscowDate().split('-').map(Number);return new Date(Date.UTC(year,month,0)).toISOString().slice(0,10)};
const money=(n:number|string)=>Number(n).toLocaleString('ru-RU',{style:'currency',currency:'RUB'});
export default function ReportsPage(){
 const [masterQuery,setMasterQuery]=useState(''),[shown,setShown]=useState(30);
 const [summary,setSummary]=useState<Summary|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 const [from,setFrom]=useState(()=>moscowDate().slice(0,7)+'-01');const [to,setTo]=useState(monthEnd);const [allMasters,setAllMasters]=useState(false);
 function period(value:string){setFrom(value==='all'?'':value==='today'?moscowDate():moscowDate().slice(0,7)+'-01');setTo(value==='all'?'':value==='today'?moscowDate():monthEnd())}
 useEffect(()=>{const c=new AbortController();setLoading(true);setError('');api<Summary>('/reports/summary?'+new URLSearchParams({from,to}),{signal:c.signal}).then(r=>{if(!c.signal.aborted)setSummary(r)}).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setLoading(false)});return()=>c.abort()},[from,to]);
 const total=summary?.total||zero;
 const filteredMasters=(summary?.masters||[]).filter(m=>(allMasters||m.count>0)&&m.name.toLocaleLowerCase('ru').includes(masterQuery.trim().toLocaleLowerCase('ru')));
 const metrics=[['Мне после Авито',money(total.owner)],['Оплачено клиентами',money(total.paid)],['На Авито',money(total.reinvest)],['Мастерам',money(total.salary)],['Запчасти',money(total.parts)],['Средний чек',money(total.count?Number(total.paid)/total.count:0)]];
 return <div className={styles.page}>
  <div className={styles.heading}><h1 className="page-title">Финансы</h1>{!loading&&!error&&<span className={styles.count}>Закрыто заявок: {total.count}</span>}</div>
  <div className={styles.presets}>{[['today','Сегодня'],['month','Этот месяц'],['all','Всё время']].map(([value,label])=><button key={value} className={(value==='all'&&!from&&!to)||(value==='today'&&from===moscowDate()&&to===moscowDate())||(value==='month'&&from===moscowDate().slice(0,7)+'-01'&&to===monthEnd())?'btn':'btn secondary'} onClick={()=>period(value)}>{label}</button>)}</div><section className={`panel ${styles.filters}`} aria-label="Период отчёта">
   <div className="field"><label htmlFor="report-from">С даты</label><input id="report-from" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div>
   <div className="field"><label htmlFor="report-to">По дату</label><input id="report-to" type="date" min={from} value={to} onChange={e=>setTo(e.target.value)}/></div>

  </section>
  {error?<p className="error" role="alert">{error}</p>:loading?<div className="panel" role="status">Загрузка…</div>:<>
   <section className={styles.metrics} aria-label="Итоги периода">{metrics.map(([label,value],i)=><div key={label} className={`${styles.metric} ${i===0?styles.highlight:''}`}><span>{label}</span><strong>{value}</strong></div>)}</section>
   <section className={styles.section}><h2>По направлению</h2><div className={styles.masters}>{(summary?.channels||[]).map(t=><article className={styles.master} key={t.name}><header><h3>{t.name}</h3><span className={styles.count}>Закрыто: {t.count}</span></header><dl className={styles.details}>{[['Получено',money(t.paid)],['Средний чек',money(t.count?Number(t.paid)/t.count:0)],['Запчасти',money(t.parts)],['Мастерам',money(t.salary)],['На Авито',money(t.reinvest)],['Мне',money(t.owner)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article>)}</div></section>
   <section className={styles.section}><div className={styles.heading}><h2>По мастерам</h2><button className="btn secondary" aria-pressed={allMasters} onClick={()=>{setAllMasters(!allMasters);setShown(30)}}>{allMasters?'Скрыть без заявок':'Все мастера'}</button></div><div className="field"><input aria-label="Поиск мастера в отчёте" placeholder="Имя мастера" value={masterQuery} onChange={e=>{setMasterQuery(e.target.value);setShown(30)}}/></div><div className={styles.masters}>{filteredMasters.slice(0,shown).map(m=>{const t=m;return <article className={styles.master} key={m.id}><header><h3>{m.name}</h3><span className={styles.count}>Закрыто: {t.count}</span></header><dl className={styles.details}>{[['Сумма заказов',money(t.paid)],['Средний чек',money(t.count?Number(t.paid)/t.count:0)],['Запчасти',money(t.parts)],['Мастеру',money(t.salary)],['На Авито',money(t.reinvest)],['Мне',money(t.owner)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article>})}</div>{filteredMasters.length>shown&&<button className="btn secondary" onClick={()=>setShown(n=>n+30)}>Ещё мастера ({shown} из {filteredMasters.length})</button>}{masterQuery&&!filteredMasters.length&&<p className={styles.empty}>Мастер не найден.</p>}{!total.count&&!allMasters&&<p className={styles.empty}>Нет закрытых заявок за период.</p>}</section>
   <section className={styles.section}><h2>По технике</h2>{!total.count?<p className={styles.empty}>За этот период закрытых заявок нет.</p>:<div className={styles.techList}>{(summary?.tech||[]).map(t=>{const type=t.type;return <article className={styles.tech} key={type}><div><h3>{type}</h3><span>Заявок: {t.count}</span></div><dl><div><dt>Сумма заказов</dt><dd>{money(t.paid)}</dd></div><div><dt>Средний чек</dt><dd>{money(t.count?Number(t.paid)/t.count:0)}</dd></div></dl></article>})}</div>}</section>
  </>}
 </div>
}
