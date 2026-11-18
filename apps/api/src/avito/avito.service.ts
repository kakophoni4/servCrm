import {BadGatewayException,BadRequestException,Injectable,ServiceUnavailableException} from '@nestjs/common';
import {readFile} from 'node:fs/promises';

@Injectable()
export class AvitoService {
 private accessToken='';
 private expiresAt=0;
 private tokenPromise?:Promise<string>;
 private tokenBackoffUntil=0;
 private profilePromise?:Promise<any>;
 private profileValue:any;
 private profileExpiresAt=0;

 private async fetchJson(url:string,init:RequestInit):Promise<{status:number;data:any}> {
  try {
   const response=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(12000)});
   const raw=await response.text();
   let data:any=null;
   try {data=JSON.parse(raw)}catch{}
   return {status:response.status,data};
  }catch {throw new ServiceUnavailableException('Авито не отвечает. Попробуйте позже');}
 }
 private fail(status:number):never {
  if(status===429)throw new ServiceUnavailableException('Лимит запросов Авито. Попробуйте позже');
  if(status===401||status===403)throw new ServiceUnavailableException('Авито не разрешил доступ. Проверьте подключение и доступность API');
  if(status===404)throw new BadRequestException('Чат Авито не найден');
  throw new BadGatewayException('Не удалось получить данные Авито');
 }
 private async token():Promise<string>{
  if(this.accessToken&&Date.now()<this.expiresAt)return this.accessToken;
  if(this.tokenPromise)return this.tokenPromise;
  if(Date.now()<this.tokenBackoffUntil)throw new ServiceUnavailableException('Подключение Авито временно недоступно. Попробуйте позже');
  this.tokenPromise=(async()=>{
   let credentials:any;
   try {credentials=JSON.parse(await readFile(process.env.AVITO_CREDENTIALS_FILE||'/run/secrets/avito.json','utf8'));}catch {throw new ServiceUnavailableException('Авито не подключён');}
   if(typeof credentials.client_id!=='string'||typeof credentials.client_secret!=='string'||!credentials.client_id||!credentials.client_secret)throw new ServiceUnavailableException('Авито не подключён');
   const result=await this.fetchJson('https://api.avito.ru/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:credentials.client_id,client_secret:credentials.client_secret})});
   if(result.status!==200)this.fail(result.status);
   if(typeof result.data?.access_token!=='string'||!result.data.access_token||!Number.isFinite(Number(result.data.expires_in))||Number(result.data.expires_in)<=0)throw new BadGatewayException('Некорректный ответ авторизации Авито');
   this.accessToken=result.data.access_token;
   const duration=Number(result.data.expires_in)*1000;
   this.expiresAt=Date.now()+Math.max(0,duration-Math.min(60000,duration/10));
   return this.accessToken;
  })();
  try{return await this.tokenPromise;}catch(e){this.tokenBackoffUntil=Date.now()+60000;throw e;}finally{this.tokenPromise=undefined;}
 }
 /** Only call with fixed API paths assembled by this service. Stats may use POST for reads. */
 async request(path:string,body?:unknown):Promise<any>{
  if(!path.startsWith('/')||path.startsWith('//')||path.includes('://'))throw new BadRequestException('Некорректный запрос Авито');
  const token=await this.token();
  const result=await this.fetchJson('https://api.avito.ru'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(result.status===401&&this.accessToken===token){this.accessToken='';this.expiresAt=0;this.profileValue=undefined;this.tokenBackoffUntil=Date.now()+60000;}
  if(result.status<200||result.status>=300)this.fail(result.status);
  if(!result.data||typeof result.data!=='object')throw new BadGatewayException('Некорректный ответ Авито');
  return result.data;
 }
 async profile():Promise<{id:number;name:string;profileUrl:string}>{
  if(this.profileValue&&Date.now()<this.profileExpiresAt)return this.profileValue;
  if(this.profilePromise)return this.profilePromise;
  this.profilePromise=(async()=>{const data=await this.request('/core/v1/accounts/self');if(!Number.isSafeInteger(data.id)||data.id<=0)throw new BadGatewayException('Некорректный профиль Авито');this.profileValue={id:data.id,name:typeof data.name==='string'?data.name:'',profileUrl:typeof data.profile_url==='string'?data.profile_url:''};this.profileExpiresAt=Date.now()+300000;return this.profileValue;})();
  try{return await this.profilePromise;}finally{this.profilePromise=undefined;}
 }
 async chats(offset=0){const profile=await this.profile();return this.request(`/messenger/v2/accounts/${profile.id}/chats?limit=30&offset=${offset}`);}
 private chatId(id:string){if(!/^[a-zA-Z0-9_~\-]{1,128}$/.test(id))throw new BadRequestException('Некорректный чат Авито');return encodeURIComponent(id);}
 async messages(id:string,offset=0){const chat=this.chatId(id),profile=await this.profile();return this.request(`/messenger/v3/accounts/${profile.id}/chats/${chat}/messages/?limit=50&offset=${offset}`);}
 private unreadCache?:{until:number;data:{ids:string[];hasMore:boolean}};
 private unreadPending?:Promise<{ids:string[];hasMore:boolean}>;
 async unread(){
  if(this.unreadCache&&this.unreadCache.until>Date.now())return this.unreadCache.data;
  if(this.unreadPending)return this.unreadPending;
  this.unreadPending=(async()=>{const p=await this.profile();const r=await this.request(`/messenger/v2/accounts/${p.id}/chats?unread_only=true&limit=100&offset=0`);if(!Array.isArray(r.chats))throw new BadGatewayException('Не удалось получить непрочитанные чаты');const data={ids:r.chats.map((c:any)=>c.id).filter((id:any)=>typeof id==='string'),hasMore:Boolean(r.meta?.has_more)};this.unreadCache={until:Date.now()+15000,data};return data;})();
  try{return await this.unreadPending;}finally{this.unreadPending=undefined;}
 }
 async markRead(id:string){const chat=this.chatId(id),p=await this.profile();const result=await this.request(`/messenger/v1/accounts/${p.id}/chats/${chat}/read`,{});if(result.ok!==true&&Object.keys(result).length!==0)throw new BadGatewayException('Не удалось отметить чат прочитанным');this.unreadCache=undefined;return {ok:true};}
 async voice(id:string){
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw new BadRequestException('Некорректное голосовое сообщение');
  const p=await this.profile(),data=await this.request(`/messenger/v1/accounts/${p.id}/getVoiceFiles?voice_ids=${encodeURIComponent(id)}`);
  const raw=data.voices_urls?.[id];let url:URL;try{url=new URL(raw)}catch{throw new BadGatewayException('Голосовое сообщение недоступно');}
  if(url.protocol!=='https:'||!['avito.ru','avito.st'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host)))throw new BadGatewayException('Голосовое сообщение недоступно');
  return {url:url.href};
 }
 async send(id:string,text:string){
  const chat=this.chatId(id);
  const message=typeof text==='string'?text.trim():'';
  if(!message||message.length>1000)throw new BadRequestException('Сообщение должно содержать от 1 до 1000 символов');
  const profile=await this.profile(),token=await this.token();
  let result:{status:number;data:any};
  try {result=await this.fetchJson(`https://api.avito.ru/messenger/v1/accounts/${profile.id}/chats/${chat}/messages`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({type:'text',message:{text:message}})});}catch {throw new ServiceUnavailableException('Не удалось подтвердить отправку. Обновите переписку перед повтором');}
  if(result.status>=500)throw new ServiceUnavailableException('Не удалось подтвердить отправку. Обновите переписку перед повтором');
  if(result.status<200||result.status>=300)this.fail(result.status);
  if(!result.data||typeof result.data.id!=='string')throw new ServiceUnavailableException('Не удалось подтвердить отправку. Обновите переписку перед повтором');
  return result.data;
 }
 async draft(id:string){
  const chatId=this.chatId(id),profile=await this.profile();
  const [chat,result]=await Promise.all([this.request(`/messenger/v2/accounts/${profile.id}/chats/${chatId}`),this.messages(id)]);
  const counterpart=Array.isArray(chat.users)?chat.users.find((u:any)=>u?.id!==profile.id):null;
  const incoming=(Array.isArray(result.messages)?result.messages:[]).filter((m:any)=>m?.type==='text'&&m.author_id!==profile.id&&typeof m.content?.text==='string').sort((a:any,b:any)=>Number(b.created||0)-Number(a.created||0))[0];
  const title=typeof chat.context?.value?.title==='string'?chat.context.value.title:'';
  return {chatId:id,clientName:typeof counterpart?.name==='string'?counterpart.name:'',comment:[title,incoming?.content?.text].filter(Boolean).join('\n').slice(0,5000),itemId:chat.context?.value?.id??null};
 }
}
