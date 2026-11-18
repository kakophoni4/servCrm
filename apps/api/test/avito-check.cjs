// No external requests: every fetch is intercepted. Dummy credentials live in an isolated temp directory.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {AvitoService}=require('../dist/avito/avito.service');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'crm-avito-check-'));
const oldFile=process.env.AVITO_CREDENTIALS_FILE,oldFetch=global.fetch;
process.env.AVITO_CREDENTIALS_FILE=path.join(root,'credentials.json');
fs.writeFileSync(process.env.AVITO_CREDENTIALS_FILE,JSON.stringify({client_id:'dummy-client',client_secret:'dummy-secret'}));
let auth=0,mode='ok',sends=0;const requests=[];
const response=(status,data)=>({status,text:async()=>typeof data==='string'?data:JSON.stringify(data)});
global.fetch=async(url,init)=>{
 requests.push({url,init});
 if(url.endsWith('/token')){auth++;await new Promise(r=>setTimeout(r,10));return response(200,{access_token:'dummy-token',expires_in:86400})}
 if(url.includes('getVoiceFiles'))return response(200,{voices_urls:{voice1:mode==='badvoice'?'https://evil.test/file':'https://files.avito.ru/audio.mp4'}});
 if(url.endsWith('/read'))return response(200,mode==='emptyread'?{}:mode==='badread'?{ok:false}:{ok:true});
 if(url.includes('unread_only=true'))return response(200,{chats:[{id:'abc~def'}],meta:{has_more:false}});
 if(url.endsWith('/self'))return response(200,{id:10,name:'Owner'});
 if(init.method==='POST'&&url.endsWith('/messages')){sends++;if(mode==='timeout')throw new Error('private upstream details');if(mode==='server')return response(503,'private body');if(mode==='forbidden')return response(403,'private body');if(mode==='malformed')return response(200,'private invalid body');return response(200,{id:'sent',created:100,type:'text',content:{text:'Hello'},direction:'out'});}
 if(mode==='forbidden')return response(403,'private upstream body');
 if(url.includes('/messages/'))return response(200,{messages:[{id:'m1',author_id:20,type:'text',created:100,content:{text:'Repair'}},{id:'m2',author_id:10,type:'text',created:101,content:{text:'Own message'}}],meta:{has_more:false}});
 if(url.endsWith('/chats/abc'))return response(200,{users:[{id:10,name:'Owner'},{id:20,name:'Client'}],context:{value:{id:5,title:'Ad'}}});
 return response(200,{chats:[],meta:{has_more:false}});
};
(async()=>{try{
 const s=new AvitoService();await Promise.all([s.chats(),s.chats(30),s.messages('abc',50)]);assert.equal(auth,1);
 assert(requests.some(r=>r.url.endsWith('/chats?limit=30&offset=30')));assert(requests.some(r=>r.url.endsWith('/messages/?limit=50&offset=50')));
 await s.messages('abc~def');assert(requests.some(r=>r.url.includes('/abc~def/messages/')));
 const unread=await s.unread();assert.deepEqual(unread.ids,['abc~def']);const count=requests.length;await s.unread();assert.equal(requests.length,count);await s.markRead('abc~def');await s.unread();assert.equal(requests.length,count+2);
 mode='emptyread';assert.deepEqual(await s.markRead('abc~def'),{ok:true});mode='badread';await assert.rejects(()=>s.markRead('abc~def'));mode='ok';
 assert.equal((await s.voice('voice1')).url,'https://files.avito.ru/audio.mp4');mode='badvoice';await assert.rejects(()=>s.voice('voice1'));mode='ok';await assert.rejects(()=>s.voice('../bad'));
 await s.chats(30,true);assert(requests.at(-1).url.endsWith('/chats?limit=30&offset=30&unread_only=true'));
 const draft=await s.draft('abc');assert.equal(draft.clientName,'Client');assert.equal(draft.comment,'Ad\nRepair');assert.equal(draft.phone,undefined);
 await assert.rejects(()=>s.messages('../bad'));await assert.rejects(()=>s.send('abc',' '));await assert.rejects(()=>s.send('abc','x'.repeat(1001)));
 assert.equal((await s.send('abc','  Hello  ')).id,'sent');const sent=requests.at(-1);assert.equal(sent.url,'https://api.avito.ru/messenger/v1/accounts/10/chats/abc/messages');assert.deepEqual(JSON.parse(sent.init.body),{type:'text',message:{text:'Hello'}});assert.equal(sent.init.redirect,'error');assert(sent.init.signal);
 for(const failure of ['timeout','server','malformed']){mode=failure;const before=sends;await assert.rejects(()=>s.send('abc','Hello'),e=>e.message==='Не удалось подтвердить отправку. Обновите переписку перед повтором');assert.equal(sends,before+1,'No automatic retries');}
 mode='forbidden';await assert.rejects(()=>s.chats(),e=>e.getStatus()===503&&!e.message.includes('private'));
 console.log('PASS Avito mock: singleflight/cache, fixed pagination, draft, validation, exact explicit-send payload, ambiguous failures without retries, sanitized non-JSON errors');
}finally{global.fetch=oldFetch;if(oldFile===undefined)delete process.env.AVITO_CREDENTIALS_FILE;else process.env.AVITO_CREDENTIALS_FILE=oldFile;fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
