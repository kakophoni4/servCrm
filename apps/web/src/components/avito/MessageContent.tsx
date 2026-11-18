'use client';
import {useState} from 'react';
import {api} from '@/lib/api';
export type AvitoMessage={id:string;created:number;type:string;direction?:string;author_id?:number;content?:{text?:string;image?:{sizes?:Record<string,string>};voice?:{voice_id?:string};link?:{url?:string;text?:string};location?:{text?:string;title?:string};item?:{title?:string;item_url?:string}}};
export function mediaUrl(raw?:string){try{const u=new URL(raw||'');return u.protocol==='https:'&&['avito.ru','avito.st'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h))?u.href:null}catch{return null}}
export function messageText(m?:AvitoMessage){if(!m)return '';if(m.content?.text)return m.content.text;return ({image:'Фото',voice:'Голосовое сообщение',video:'Видео',file:'Файл',location:'Адрес',call:'Звонок',appCall:'Звонок через Авито',system:'Сообщение Авито',deleted:'Сообщение удалено',link:'Ссылка',item:'Объявление'}[m.type]||'Вложение недоступно в API Авито')}
export function MessageContent({message:m}:{message:AvitoMessage}){
 const [failed,setFailed]=useState(false),[voice,setVoice]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(m.type==='image'){
  const variants=Object.entries(m.content?.image?.sizes||{}).filter(([,url])=>mediaUrl(url)).sort(([a],[b])=>parseInt(b,10)-parseInt(a,10));
  const url=variants[0]?.[1];
  if(url&&!failed)return <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Открыть фото"><img src={url} alt="Фото из переписки" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)} style={{display:'block',maxWidth:'100%',width:320,maxHeight:360,objectFit:'contain',borderRadius:8}}/></a>;
  return <span>Фото недоступно</span>;
 }
 if(m.type==='voice'&&m.content?.voice?.voice_id){
  return <div>{voice?<audio key={voice} controls preload="metadata" src={voice} style={{maxWidth:'100%',width:270}} onError={()=>setError('Не удалось воспроизвести. Обновите ссылку или откройте запись.')}/>:null}{(!voice||error)&&<button type="button" className="btn secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const r=await api<{url:string}>('/avito/voices/'+encodeURIComponent(m.content!.voice!.voice_id!));const url=mediaUrl(r.url);if(!url)throw Error('Запись недоступна');setVoice(url)}catch(e){setError(e instanceof Error?e.message:'Запись недоступна')}finally{setBusy(false)}}}>{busy?'Загрузка...':voice?'Обновить запись':'Загрузить голосовое'}</button>}{voice&&<a href={voice} target="_blank" rel="noopener noreferrer">Открыть запись</a>}{error&&<span role="alert">{error}</span>}</div>;
 }
 if(m.type==='link') {const url=mediaUrl(m.content?.link?.url);if(url)return <a href={url} target="_blank" rel="noopener noreferrer">{m.content?.link?.text||url}</a>}
 if(m.type==='item') {const url=mediaUrl(m.content?.item?.item_url);if(url)return <a href={url} target="_blank" rel="noopener noreferrer">{m.content?.item?.title||'Объявление'}</a>}
 return <>{m.content?.location?.text||m.content?.location?.title||messageText(m)}</>;
}
