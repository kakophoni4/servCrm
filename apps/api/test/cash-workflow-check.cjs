const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const {SettlementsService}=require('../dist/settlements/settlements.service');
const {BotService}=require('../dist/bot/bot.service');
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname),'Local database required');
const p=new PrismaClient(),svc=new SettlementsService(p,{}),tag='cashcheck'+Date.now();
const ids=[];let owner,user,master,client;
(async()=>{try{
 owner=await p.user.create({data:{login:tag+'owner',passwordHash:'test',fullName:'Owner test',role:'OWNER',telegramId:tag+'1'}});
 user=await p.user.create({data:{login:tag,passwordHash:'test',fullName:'Cash test',role:'MASTER',telegramId:tag+'2',masterProfile:{create:{}}},include:{masterProfile:true}});master=user.masterProfile;
 client=await p.client.create({data:{name:'Test',phoneNormalized:tag}});
 const old=new Date('2026-11-15T20:59:59Z'),today=new Date('2026-11-15T21:00:00Z'),now=new Date('2026-11-16T12:00:00Z');
 async function order(status,when,paid,toCompany,isPersonal=false){const o=await p.order.create({data:{publicId:tag+ids.length,seqPrefix:tag,seq:ids.length+1,clientId:client.id,masterId:master.id,address:'Test',sourceKind:'OUR',status,isPersonal,createdAt:when,updatedAt:when,scheduledAt:when,completedAt:status==='DONE'?when:null,payment:{create:{paid,toCompany}}}});ids.push(o.id)}
 await order('DONE',old,4000,2000);await order('DONE',today,10000,5000);await order('WAITING',today,0,0);await order('REFUSAL',today,0,0);await order('DONE',today,9999,9999,true);
 await p.cashTx.create({data:{masterId:master.id,direction:'INCOME',incomeBasis:'FINE',amount:300,createdById:owner.id}});
 await p.masterSettlement.create({data:{masterId:master.id,amount:7000,paidAmount:1000,periodFrom:old,periodTo:now}});
 assert.deepEqual(await svc.cashBalance(master.id),{masterId:master.id,due:7300,paid:1000,remaining:6300,credit:0});
 const report=await svc.cashReport(master.id,now);assert(report.includes('Заявок: 3'));assert(report.includes('Выполнено: 1'));assert(report.includes('Средний чек: 10 000 ₽'));assert(report.includes('Без ремонта: 1'));assert(!report.includes('Авито'));assert(!report.includes('Владельцу'));
 const input={masterId:master.id,amount:1000,requestId:randomUUID()};
 await assert.rejects(()=>svc.receiveCash(input,user.id,'MASTER'));
 await Promise.all([svc.receiveCash(input,owner.id,'OWNER'),svc.receiveCash(input,owner.id,'OWNER')]);assert.equal((await svc.cashBalance(master.id)).remaining,5300);
 await assert.rejects(()=>svc.receiveCash({...input,amount:2000},owner.id,'OWNER'));
 const concurrent=await Promise.allSettled([1,2].map(()=>svc.receiveCash({...input,amount:4000,requestId:randomUUID()},owner.id,'OWNER')));assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal((await svc.cashBalance(master.id)).remaining,1300);
 await svc.receiveCash({...input,amount:1300,requestId:randomUUID()},owner.id,'OWNER');assert.equal((await svc.cashBalance(master.id)).remaining,0);
 const cleared=await svc.cashReport(master.id,now);assert(cleared.includes('К сдаче: 0 ₽'));assert(!cleared.includes('Уже сдано'));assert(!cleared.includes('за всё время'));
 await assert.rejects(()=>svc.receiveCash({...input,amount:1,requestId:randomUUID()},owner.id,'OWNER'));
 const settings={get:async key=>key==='bot.master.group.'+master.id?JSON.stringify({chatId:'-123',title:'Test'}):null};
 const bot=new BotService(p,{},settings,{},svc,{}),messages=[];bot.sendMessage=async(chat,text)=>{messages.push({chat,text});return {ok:true}};
 const message=(sender,chat,type,text='касса')=>bot.processUpdate({message:{from:{id:sender},chat:{id:chat,type},text}});
 // Use real numeric Telegram identities for command routing.
 await p.user.update({where:{id:user.id},data:{telegramId:'780000001'}});await p.user.update({where:{id:owner.id},data:{telegramId:'780000002'}});
 await message(780000001,-123,'supergroup');assert(messages.at(-1).text.startsWith('Касса'));
 await message(780000001,-999,'supergroup');assert(!messages.at(-1).text.startsWith('Касса'));
 await message(780000003,-123,'supergroup');assert(!messages.at(-1).text.startsWith('Касса'));
 await message(780000002,-123,'supergroup','/kassa');assert(messages.at(-1).text.includes('Мастер: Cash test'));
 console.log('PASS Moscow day boundary, live lifetime debt, old receipts, partial/full cash handover, retries, concurrent overpayment prevention, owner-only receipt, Telegram routing and privacy');
}finally{
 await p.cashTx.deleteMany({where:{masterId:master?.id||'missing'}});
 await p.order.deleteMany({where:{id:{in:ids}}});
 if(master)await p.masterSettlement.deleteMany({where:{masterId:master.id}});
 if(owner)await p.appSetting.deleteMany({where:{key:{startsWith:'cash.receipt.'+owner.id+'.'}}});
 if(master)await p.master.delete({where:{id:master.id}});
 if(user)await p.user.delete({where:{id:user.id}});
 if(owner)await p.user.delete({where:{id:owner.id}});
 if(client)await p.client.delete({where:{id:client.id}});
 await p.$disconnect();
}})().catch(e=>{console.error(e);process.exitCode=1});
