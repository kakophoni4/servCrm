'use client';
import { useCallback, useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
type Group = {chatId:string;title:string} | null;
export function GroupSettingsPanel({kind='common'}:{kind?:'common'|'owner'|'center'}) {
  const endpoint=kind==='common'?'/bot/group':'/bot/destinations/'+kind;
  const title=kind==='owner'?'Мой чат':kind==='center'?'Чат СЦ':'Общая группа';
  const previousChat=useRef<string|null>(null);
  const pending=useRef(false);
  const [group,setGroup]=useState<Group>(null);
  const [command,setCommand]=useState('');
  const [username,setUsername]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [copied,setCopied]=useState(false);
  const refresh=useCallback(async()=>{const next=await api<Group>(endpoint);setGroup(next);if(pending.current&&next&&next.chatId!==previousChat.current){setCommand('');pending.current=false;}},[endpoint]);
  useEffect(()=>{refresh().catch(e=>setError(e.message));},[refresh]);
  useEffect(()=>{if(!command)return;const timer=setInterval(()=>{refresh().catch(()=>{});},5000);return ()=>clearInterval(timer);},[command,refresh]);
  async function connect(){previousChat.current=group?.chatId||null;pending.current=true;setBusy(true);setError('');try{const r=await api<{command:string;username:string}>(endpoint+'/link',{method:'POST'});setCommand(r.command);setUsername(r.username);setCopied(false);}catch(e){setError(e instanceof Error?e.message:'Ошибка подключения');}finally{setBusy(false);}}
  async function disconnect(){if(!confirm('Отключить отправку заявок в группу?'))return;setBusy(true);setError('');try{await api(endpoint+'/disconnect',{method:'POST'});setGroup(null);setCommand('');}catch(e){setError(e instanceof Error?e.message:'Ошибка');}finally{setBusy(false);}}
  return <section className="panel group-settings">
    <h2 className="bot-settings-title">{title}</h2>
    <p>{group ? <>Подключена: <strong>{group.title}</strong></> : 'Группа не подключена'}</p>

    <div className="bot-settings-actions"><button className="btn secondary" onClick={connect} disabled={busy}>{group?'Подключить другую группу':'Подключить группу'}</button>{group&&<button className="btn secondary" onClick={disconnect} disabled={busy}>Отключить</button>}</div>
    {command&&<div className="group-connect">
      <ol><li>Добавьте @{username} в группу и назначьте администратором.</li><li>Отправьте команду ниже в группу от своего аккаунта администратора.</li></ol>
      <label className="field"><span>Команда на 24 часа</span><textarea readOnly value={command} rows={3} onFocus={e=>e.target.select()}/></label>
      <div className="bot-settings-actions"><button className="btn" onClick={async()=>{try{await navigator.clipboard.writeText(command);setCopied(true);}catch{setError('Выделите и скопируйте команду из поля');}}}>{copied?'Скопировано':'Скопировать команду'}</button><button className="btn secondary" onClick={()=>refresh().catch(e=>setError(e.message))}>Обновить статус</button></div>
    </div>}
    {error&&<p className="error" role="alert">{error}</p>}
  </section>;
}
