const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const {OrderDeletionController}=require('../dist/orders/order-deletion.controller');
const {SettlementsService}=require('../dist/settlements/settlements.service');
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname));
const p=new PrismaClient(),tag='deletecheck'+Date.now();let owner,staff,client,order,thread,masterUser;const keys=[],removed=[],messages=[];
(async()=>{try{
 owner=await p.user.create({data:{login:tag,passwordHash:'test',fullName:'Test owner',role:'OWNER'}});
 staff=await p.user.create({data:{login:tag+'staff',passwordHash:'test',fullName:'Test staff',role:'ADMIN'}});
 masterUser=await p.user.create({data:{login:tag+'master',passwordHash:'test',fullName:'Test master',role:'MASTER',masterProfile:{create:{}}},include:{masterProfile:true}});
 client=await p.client.create({data:{phoneNormalized:tag,name:'Keep client'}});
 order=await p.order.create({data:{publicId:tag,seqPrefix:tag,seq:1,clientId:client.id,address:'Test',sourceKind:'OUR',masterId:masterUser.masterProfile.id,status:'DONE',completedAt:new Date(),payment:{create:{paid:100,partsCost:10,toCompany:50}},documents:{create:{fileName:'test.jpg',filePath:tag+'.jpg'}},claims:{create:{type:'POLICE'}}}});
 thread=await p.chatThread.create({data:{linkedOrderId:order.id}});
 await p.cashTx.create({data:{direction:'INCOME',amount:100,orderId:order.id}});
 const token=tag+'token';for(const [key,value] of [['bot.card.-123.987',{orderId:order.id,chatId:'-123',messageId:987}],['bot.docs.session.'+token,{orderId:order.id,chatId:'-123',messageId:987}],['bot.file.pending.'+token+'.987',{token}],['bot.docs.reply.-123.987',{token}]]){keys.push(key);await p.appSetting.create({data:{key,value:JSON.stringify(value)}})}
 const settlements=new SettlementsService(p,{});await p.masterSettlement.create({data:{masterId:masterUser.masterProfile.id,amount:10,paidAmount:10,periodFrom:new Date(),periodTo:new Date()}});assert.equal((await settlements.cashBalance(masterUser.masterProfile.id)).remaining,40);
 const svc=new OrderDeletionController(p,{remove:path=>removed.push(path)},{telegram:async(method,body)=>{assert.equal(await p.order.count({where:{id:order.id}}),0);messages.push({method,...body});return {ok:true}}},settlements);
 await assert.rejects(()=>svc.remove(order.id,{confirmation:tag},{userId:staff.id,role:'ADMIN'}));
 await assert.rejects(()=>svc.remove(order.id,{confirmation:tag},{userId:staff.id,role:'OWNER'}));
 await assert.rejects(()=>svc.remove(order.id,{confirmation:'wrong'},{userId:owner.id,role:'OWNER'}));
 assert.equal(await p.order.count({where:{id:order.id}}),1);assert.equal(removed.length,0);
 const result=await svc.remove(order.id,{confirmation:tag},{userId:owner.id,role:'OWNER'});assert.equal(result.deleted,true);assert.equal(result.cleanupPending,0);assert.equal((await settlements.cashBalance(masterUser.masterProfile.id)).remaining,0);assert.equal((await settlements.cashBalance(masterUser.masterProfile.id)).credit,10);
 for(const table of ['orderPayment','orderDocument','claim','cashTx'])assert.equal(await p[table].count({where:{orderId:order.id}}),0);
 assert.equal(await p.appSetting.count({where:{key:{in:keys}}}),0);assert.equal((await p.chatThread.findUnique({where:{id:thread.id}})).linkedOrderId,null);
 assert(await p.client.findUnique({where:{id:client.id}}));assert.deepEqual(removed,[tag+'.jpg']);assert.equal(messages.length,1);assert.deepEqual(messages[0].reply_markup.inline_keyboard,[]);
 await assert.rejects(()=>svc.remove(order.id,{confirmation:tag},{userId:owner.id,role:'OWNER'}));console.log('PASS deletion owner-only, current role, exact confirmation, dependencies and queued jobs, client retained, Telegram buttons removed, duplicate rejected');
}finally{
 await p.appSetting.deleteMany({where:{key:{in:[...keys,...(order?['order.deleted.'+order.id]:[])]}}});
 if(thread)await p.chatThread.deleteMany({where:{id:thread.id}});
 if(order){await p.cashTx.deleteMany({where:{orderId:order.id}});await p.order.deleteMany({where:{id:order.id}})}
 if(masterUser){await p.masterSettlement.deleteMany({where:{masterId:masterUser.masterProfile.id}});await p.master.delete({where:{id:masterUser.masterProfile.id}});await p.user.delete({where:{id:masterUser.id}})}
 if(client)await p.client.delete({where:{id:client.id}});if(staff)await p.user.delete({where:{id:staff.id}});if(owner)await p.user.delete({where:{id:owner.id}});await p.$disconnect();
}})().catch(e=>{console.error(e);process.exitCode=1});
