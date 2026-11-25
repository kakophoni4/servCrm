require('reflect-metadata');
const assert=require('node:assert/strict');
const {NestFactory}=require('@nestjs/core');const {ValidationPipe}=require('@nestjs/common');
const {PrismaClient}=require('@prisma/client');const bcrypt=require('bcrypt');
const {BotService}=require('../dist/bot/bot.service');
assert(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname),'Local database only');
BotService.prototype.onModuleInit=function(){};BotService.prototype.onModuleDestroy=function(){};
BotService.prototype.telegram=async()=>{throw Error('Unexpected network operation')};
for(const method of ['notifyMasterOrder','notifyOrderRescheduled','notifyMasterStatusChanged','notifyAdminsNewOrder','notifyMasterOrderRevoked','ackOrderNotify'])BotService.prototype[method]=async()=>({ok:true});
BotService.prototype.sendOrderToGroup=async()=>({sent:true});
const {AppModule}=require('../dist/app.module');const p=new PrismaClient(),ids=[];let app,owner,client,order,masterUser;
(async()=>{try{
 const tag='staffhttp'+Date.now(),password='Test-123456!';
 owner=await p.user.create({data:{login:tag,passwordHash:await bcrypt.hash(password,10),fullName:'Test owner',role:'OWNER'}});
 masterUser=await p.user.create({data:{login:tag+'master',passwordHash:'testsecret',fullName:'Master',role:'MASTER',masterProfile:{create:{}}},include:{masterProfile:true}});
 client=await p.client.create({data:{name:tag,phoneNormalized:tag}});
 order=await p.order.create({data:{publicId:tag,seqPrefix:tag,seq:1,clientId:client.id,address:'Test',sourceKind:'OUR',masterId:masterUser.masterProfile.id,payment:{create:{paid:200,partsCost:10}}}});
 app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api');app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true}));await app.listen(0,'127.0.0.1');const base=await app.getUrl();
 async function call(method,path,token,body){const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()}}
 const login=async login=>{const r=await call('POST','/auth/login',null,{login,password});assert.equal(r.status,200);return r.data.accessToken};
 const ownerToken=await login(tag);
 const changedPhone=await call('PATCH','/clients/'+client.id+'/phone',ownerToken,{phone:'8 (999) 123-45-67'});assert.equal(changedPhone.status,200);assert.equal(changedPhone.data.phoneNormalized,'79991234567');
 assert.equal((await call('PATCH','/clients/'+client.id+'/phone',ownerToken,{phone:'123'})).status,400);
 const warranty=await call('PATCH','/orders/'+order.id,ownerToken,{warrantyMonths:12});assert.equal(warranty.status,200);assert.equal(warranty.data.warrantyMonths,12);
 for(const value of [-1,1.5,121])assert.equal((await call('PATCH','/orders/'+order.id,ownerToken,{warrantyMonths:value})).status,400);
 assert.equal((await call('PATCH','/orders/'+order.id,ownerToken,{warrantyMonths:null})).data.warrantyMonths,null);
 assert.equal((await call('POST','/avito/chats/test/messages',ownerToken,{text:' '})).status,400);
 assert.equal((await call('GET','/avito/chats?offset=-1',ownerToken)).status,400);
 assert.equal((await call('GET','/inventory',ownerToken)).status,200);
 assert.equal((await call('POST','/inventory',ownerToken,{name:'bad',category:'',quantity:-1,minimum:0})).status,400);
 assert.equal((await call('PUT','/inventory/orders/'+order.id,ownerToken,{items:[]})).status,200);
 for(const profile of ['logistic','assistant']){
 const created=await call('POST','/staff',ownerToken,{login:tag+profile,fullName:profile,password,profile});assert.equal(created.status,201,JSON.stringify(created.data));ids.push(created.data.id);
 const token=await login(tag+profile);
 assert.equal((await call('PATCH','/clients/'+client.id+'/phone',token,{phone:'79991234568'})).status,403);
 assert.equal((await call('PATCH','/orders/'+order.id,token,{warrantyMonths:12})).status,profile==='assistant'?200:403);
assert.equal((await call('GET','/auth/me',token)).data.permissions.includes('staff.'+profile),true);
 for(const path of ['/avito/profile','/avito/chats','/avito/stats?from=2026-11-01&to=2026-11-18','/inventory','/inventory/history','/inventory/orders/'+order.id,'/staff','/settings/bot','/salary-categories','/settlements/cash','/users'])assert.equal((await call('GET',path,token)).status,403,path);
 assert.equal((await call('POST','/avito/chats/test/messages',token,{text:'test'})).status,403);
 assert.equal((await call('POST','/staff',token,{login:'bad',fullName:'bad',password,profile})).status,403);
 const detail=await call('GET','/orders/'+order.id,token);assert.equal(detail.status,200);assert(!JSON.stringify(detail.data).includes('testsecret'));
 const list=await call('GET','/orders',token);assert.equal(list.status,200);assert(list.data.some(o=>o.id===order.id));
 if(profile==='logistic'){
 assert.equal(detail.data.payment,undefined);assert.equal(list.data.find(o=>o.id===order.id).payment,undefined);
 assert.equal((await call('PATCH','/orders/'+order.id,token,{paid:100})).status,403);
 assert.equal((await call('PATCH','/orders/'+order.id,token,{status:'DONE'})).status,403);
 const assigned=await call('PATCH','/orders/'+order.id,token,{masterId:masterUser.masterProfile.id,scheduledAt:'2035-01-01T10:00:00Z'});assert.equal(assigned.status,200,JSON.stringify(assigned.data));assert.equal(assigned.data.scheduledAt,'2035-01-01T10:00:00.000Z');
 }else{assert.equal(Number(detail.data.payment.paid),200);const payment=await call('PATCH','/orders/'+order.id,token,{paid:100,partsCost:10});assert.equal(payment.status,200,JSON.stringify(payment.data));assert.equal(Number(payment.data.payment.paid),100);}
 assert.equal((await call('POST','/staff/'+created.data.id+'/active',ownerToken,{active:false})).status,201);
 assert.equal((await call('GET','/orders',token)).status,401);
 }
 console.log('PASS HTTP owner staff management, both profile logins, guarded routes, nested secret and financial redaction, logistic payment/closure denial, assignment/scheduling, assistant money update, disabled JWT rejected');
}finally{if(app)await app.close();if(order){await p.cashTx.deleteMany({where:{orderId:order.id}});await p.order.delete({where:{id:order.id}})}if(masterUser){await p.masterSettlement.deleteMany({where:{masterId:masterUser.masterProfile.id}});await p.master.delete({where:{id:masterUser.masterProfile.id}});await p.user.delete({where:{id:masterUser.id}})}if(client)await p.client.delete({where:{id:client.id}});await p.user.deleteMany({where:{id:{in:[...ids,...(owner?[owner.id]:[])]}}});await p.$disconnect()}})().catch(e=>{console.error(e);process.exitCode=1});
