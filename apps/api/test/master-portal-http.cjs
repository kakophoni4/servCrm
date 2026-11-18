const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const crypto=require('node:crypto');
const bcrypt=require('bcrypt');
const {PrismaClient}=require('@prisma/client');
const url=new URL(process.env.DATABASE_URL||'postgres://invalid/invalid');
if(!/^crm_portal_test_[a-z0-9_]+$/.test(decodeURIComponent(url.pathname.slice(1))))throw new Error('Dedicated crm_portal_test_* database required');
const db=new PrismaClient();const prefix='http_'+crypto.randomBytes(6).toString('hex');const password=crypto.randomBytes(16).toString('hex');const ids={users:[],masters:[],orders:[],clients:[]};let child;
const base='http://127.0.0.1:3105/api';
async function http(method,route,token,body,status){const r=await fetch(base+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});assert.equal(r.status,status,`${method} ${route}: unexpected status`);return r.json();}
async function login(login){return (await http('POST','/auth/login',null,{login,password},200)).accessToken;}
async function user(suffix,role,extra={}){const u=await db.user.create({data:{login:prefix+'_'+suffix,passwordHash:await bcrypt.hash(password,10),fullName:prefix+' '+suffix,role,status:'ACTIVE',...extra}});ids.users.push(u.id);return u;}
async function main(){
 assert.equal(await db.appSetting.count(),0,'Test DB must have empty settings: no Telegram');
 const owner=await user('owner','OWNER'),worker=await user('master','MASTER'),other=await user('other','MASTER'),staff=await user('logistic','ADMIN',{permissions:['staff.logistic']});
 const m=await db.master.create({data:{userId:worker.id}});ids.masters.push(m.id);const m2=await db.master.create({data:{userId:other.id}});ids.masters.push(m2.id);
 const client=await db.client.create({data:{name:prefix,phoneNormalized:prefix}});ids.clients.push(client.id);
 for(const [i,masterId] of [m.id,m2.id].entries()){const o=await db.order.create({data:{publicId:prefix+'_'+i,seqPrefix:prefix,seq:i+1,clientId:client.id,masterId,type:'NEW',sourceKind:'OUR',sourceOur:'AVITO',address:'Test address',status:'WAITING'}});ids.orders.push(o.id);}
 child=spawn(process.execPath,[path.resolve(__dirname,'../dist/main.js')],{env:{...process.env,PORT:'3105',JWT_SECRET:crypto.randomBytes(32).toString('hex')},stdio:['ignore','pipe','pipe']});
 let ready=false,failed=false;child.stdout.on('data',b=>{if(b.toString().includes('API listening on'))ready=true});child.stderr.on('data',()=>{});child.on('exit',()=>{failed=true});
 for(let i=0;i<120&&!ready&&!failed;i++)await new Promise(r=>setTimeout(r,250));assert(ready&&!failed,'Test API did not start');
 await http('POST','/auth/login',null,{login:worker.login,password},401);
 const ot=await login(owner.login);
 await http('POST',`/master-portal/masters/${m.id}/access`,ot,{login:worker.login,password},201);
 const mt=await login(worker.login),st=await login(staff.login);
 const masterPage=await http('GET','/masters/paged?page=1&limit=1&q='+encodeURIComponent(prefix),ot,null,200);assert.equal(masterPage.total,2);assert.equal(masterPage.items.length,1);assert.equal(masterPage.totalPages,2);assert.equal(masterPage.items[0].activeCount,1);
 const jobs=await http('GET',`/masters/${m.id}/jobs?page=1&limit=1`,ot,null,200);assert.equal(jobs.total,1);assert.equal(jobs.items[0].id,ids.orders[0]);
 const paged=await http('GET','/orders/paged?filter=all&limit=1&q='+encodeURIComponent(prefix),ot,null,200);assert.equal(paged.total,2);assert.equal(paged.items.length,1);assert.equal(paged.totalPages,2);
 const page2=await http('GET','/orders/paged?filter=all&limit=1&page=2&q='+encodeURIComponent(prefix),ot,null,200);assert.notEqual(page2.items[0].id,paged.items[0].id);
 const cp=await http('GET','/clients/paged?q='+encodeURIComponent(prefix),ot,null,200);assert.equal(cp.total,1);assert.equal(cp.items[0]._count.orders,2);
 await http('GET','/orders/paged?limit=101',ot,null,400);

 const list=await http('GET','/master-portal/orders',mt,null,200);assert.deepEqual(list.map(o=>o.id),[ids.orders[0]]);
 await http('GET',`/master-portal/orders/${ids.orders[1]}`,mt,null,404);
 for(const route of ['/orders','/clients','/masters','/inventory','/reports/closed','/settings/bot','/avito/chats'])await http('GET',route,mt,null,403);
 const me=await http('GET','/auth/me',mt,null,200);assert.equal(me.id,worker.id);
 const route=`/master-portal/orders/${ids.orders[0]}/messages`;
 await http('POST',route,st,{body:'Logistic test message'},201);await http('POST',route,mt,{body:'Master test reply'},201);
 const messages=await http('GET',route,st,null,200);assert.equal(messages.length,2);assert.equal(messages[1].body,'Master test reply');
 const inbox=await http('GET','/master-portal/inbox',st,null,200);assert(inbox.some(r=>r.orderId===ids.orders[0]));
 await http('POST',`/master-portal/orders/${ids.orders[0]}/action`,st,{action:'close',version:new Date().toISOString(),paid:100,partsCost:0},403);
 await http('POST',`/master-portal/masters/${m2.id}/access`,mt,{login:other.login,password},403);
 await db.user.update({where:{id:worker.id},data:{masterWebEnabled:false}});await http('GET','/auth/me',mt,null,401);
 await db.user.update({where:{id:worker.id},data:{masterWebEnabled:true,status:'FIRED'}});await http('GET','/auth/me',mt,null,401);
 console.log('PASS master portal HTTP: explicit activation, scoped orders, forbidden office APIs, discussion roundtrip, revoked JWT');
}
main().catch(e=>{console.error('FAIL master portal HTTP:',e.message);process.exitCode=1}).finally(async()=>{
 if(child){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,2000))]);if(child.exitCode===null)child.kill('SIGKILL');}
 try{await db.orderDiscussionMessage.deleteMany({where:{orderId:{in:ids.orders}}});await db.order.deleteMany({where:{id:{in:ids.orders}}});await db.master.deleteMany({where:{id:{in:ids.masters}}});await db.client.deleteMany({where:{id:{in:ids.clients}}});await db.user.deleteMany({where:{id:{in:ids.users}}});}finally{await db.$disconnect();}
});
