
'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {api,getStoredUser} from '@/lib/api';
export type UnreadEntry={id:string;messageId:string;created:number;name:string;incoming:boolean};
type State={ids:string[];hasMore:boolean;entries?:UnreadEntry[]};
export function newMessages(previous:Record<string,string>|null,entries:UnreadEntry[],since:number){return previous===null?[]:entries.filter(e=>e.incoming&&e.messageId&&previous[e.id]!==e.messageId&&e.created>=since)}
const Context=createContext<State&{refresh:()=>void;read:(id:string)=>Promise<void>;notifications:boolean;toggleNotifications:()=>Promise<void>;notice:string}>({ids:[],hasMore:false,refresh:()=>{},read:async()=>{},notifications:false,toggleNotifications:async()=>{},notice:''});
export function useAvitoUnread(){return useContext(Context)}
export function AvitoUnreadProvider({children}:{children:React.ReactNode}){
 const [state,setState]=useState<State>({ids:[],hasMore:false}),seq=useRef(0),abort=useRef<AbortController|null>(null);
 const [toast,setToast]=useState<UnreadEntry|null>(null),[notifications,setNotifications]=useState(false),[notice,setNotice]=useState('');
 const enabled=useRef(false),seen=useRef<Record<string,string>|null>(null),since=useRef(Math.floor(Date.now()/1000)),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const refresh=useCallback(()=>{
  if(getStoredUser()?.role!=='OWNER'||(document.visibilityState!=='visible'&&!enabled.current))return;
  const version=++seq.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;
  api<State>('/avito/unread',{signal:controller.signal}).then(s=>{if(seq.current!==version||controller.signal.aborted)return;
   const entries=s.entries||[],fresh=newMessages(seen.current,entries,since.current);
   seen.current={...(seen.current||{}),...Object.fromEntries(entries.map(e=>[e.id,e.messageId]))};
   try{sessionStorage.setItem('avito-seen',JSON.stringify({seen:seen.current,since:since.current}))}catch{}
   if(fresh.length){const latest=fresh.sort((a,b)=>b.created-a.created)[0];setToast(latest);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setToast(null),12000);
    if(enabled.current&&document.visibilityState!=='visible'&&'Notification' in window&&Notification.permission==='granted'){try{const n=new Notification('Новое сообщение в Авито',{body:latest.name,tag:'avito-'+latest.id});n.onclick=()=>{window.focus();window.location.assign('/avito?chat='+encodeURIComponent(latest.id));n.close()}}catch{}}
   }setState(s);
  }).catch(()=>{});
 },[]);
 const toggleNotifications=useCallback(async()=>{
  setNotice('');if(enabled.current){enabled.current=false;setNotifications(false);localStorage.removeItem('avito-notifications');return}
  if(!('Notification' in window)){setNotice('Этот браузер поддерживает только уведомления внутри CRM');return}
  try{const permission=await Notification.requestPermission();if(permission==='granted'){enabled.current=true;setNotifications(true);localStorage.setItem('avito-notifications','on');setNotice('Включены, пока CRM открыта в браузере')}else setNotice('Разрешите уведомления в настройках браузера. Внутри CRM они работают.')}catch{setNotice('Уведомления доступны внутри CRM')}
 },[]);
 const read=useCallback(async(id:string)=>{
  await api('/avito/chats/'+encodeURIComponent(id)+'/read',{method:'POST'});
  ++seq.current;abort.current?.abort();setState(s=>({...s,ids:s.ids.filter(x=>x!==id)}));setToast(t=>t?.id===id?null:t);
 },[]);
 useEffect(()=>{
  try{const stored=JSON.parse(sessionStorage.getItem('avito-seen')||'null');if(stored?.seen&&typeof stored.since==='number'){seen.current=stored.seen;since.current=stored.since}}catch{}
  enabled.current=localStorage.getItem('avito-notifications')==='on'&&'Notification' in window&&Notification.permission==='granted';setNotifications(enabled.current);
  refresh();const interval=setInterval(refresh,30000);document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(interval);if(timer.current)clearTimeout(timer.current);document.removeEventListener('visibilitychange',refresh);abort.current?.abort()}
 },[refresh]);
 useEffect(()=>{const original=document.title;document.title=state.ids.length?`(${state.ids.length}${state.hasMore?'+':''}) СРМ Сервис`:'СРМ Сервис';return()=>{document.title=original}},[state.ids.length,state.hasMore]);
 return <Context.Provider value={{...state,refresh,read,notifications,toggleNotifications,notice}}>{children}{toast&&<aside className="avito-message-toast" role="status"><a href={'/avito?chat='+encodeURIComponent(toast.id)}><strong>Новое сообщение в Авито</strong><span>{toast.name}</span></a><button aria-label="Закрыть уведомление" onClick={()=>setToast(null)}>×</button></aside>}</Context.Provider>;
}
