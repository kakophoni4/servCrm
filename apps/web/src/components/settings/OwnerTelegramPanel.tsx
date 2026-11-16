 'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/api';
export function OwnerTelegramPanel(){
 const [connected,setConnected]=useState(false),[url,setUrl]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){const r=await api<{connected:boolean}>('/bot/owner');setConnected(r.connected)}
 useEffect(()=>{refresh().catch(e=>setError(e.message))},[]);
 useEffect(()=>{if(!url)return;const timer=setInterval(()=>{refresh().catch(()=>{})},5000);return()=>clearInterval(timer)},[url]);
 async function connect(){setBusy(true);setError('');try{const r=await api<{url:string}>('/bot/owner/link',{method:'POST'});setUrl(r.url)}catch(e){setError(e instanceof Error?e.message:'Ошибка подключения')}finally{setBusy(false)}}
 return <section className="panel group-settings"><h2 className="bot-settings-title">Мой Telegram</h2><p>{connected?'Подключён к аккаунту владельца':'Подключите свой аккаунт для управления заявками в Telegram.'}</p><div className="bot-settings-actions"><button className="btn secondary" disabled={busy} onClick={connect}>{connected?'Сменить аккаунт':'Подключить мой Telegram'}</button>{url&&<a className="btn" href={url} target="_blank" rel="noreferrer">Открыть бота</a>}</div>{url&&<p>Откройте бота со своего аккаунта и нажмите «Запустить». Ссылка действует сутки.</p>}{error&&<p role="alert" className="error">{error}</p>}</section>
}
