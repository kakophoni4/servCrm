'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {api,getStoredUser} from '@/lib/api';
type State={ids:string[];hasMore:boolean};
const Context=createContext<State&{refresh:()=>void;read:(id:string)=>Promise<void>}>({ids:[],hasMore:false,refresh:()=>{},read:async()=>{}});
export function useAvitoUnread(){return useContext(Context)}
export function AvitoUnreadProvider({children}:{children:React.ReactNode}){
 const [state,setState]=useState<State>({ids:[],hasMore:false}),seq=useRef(0),abort=useRef<AbortController|null>(null);
 const refresh=useCallback(()=>{
  if(getStoredUser()?.role!=='OWNER'||document.visibilityState!=='visible')return;
  const version=++seq.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;
  api<State>('/avito/unread',{signal:controller.signal}).then(s=>{if(seq.current===version&&!controller.signal.aborted)setState(s)}).catch(()=>{});
 },[]);
 const read=useCallback(async(id:string)=>{
  await api('/avito/chats/'+encodeURIComponent(id)+'/read',{method:'POST'});
  ++seq.current;abort.current?.abort();setState(s=>({...s,ids:s.ids.filter(x=>x!==id)}));
 },[]);
 useEffect(()=>{refresh();const timer=setInterval(refresh,30000);document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh);abort.current?.abort()}},[refresh]);
 return <Context.Provider value={{...state,refresh,read}}>{children}</Context.Provider>;
}
