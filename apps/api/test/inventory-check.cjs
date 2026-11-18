const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const {InventoryService}=require('../dist/inventory/inventory.service');
assert(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname),'Local database required');
const db=new PrismaClient(),svc=new InventoryService(db),tag='stock-'+Date.now(),orders=[],parts=[];let client;
(async()=>{try{
 client=await db.client.create({data:{name:tag,phoneNormalized:tag}});
 const make=async()=>{const o=await db.order.create({data:{publicId:tag+orders.length,seqPrefix:tag,seq:orders.length+1,clientId:client.id,address:'test',sourceKind:'OUR'}});orders.push(o.id);return o.id};
 const p=(await svc.create({name:tag,category:'test',quantity:10,minimum:2})).id;parts.push(p);
 const balance=async()=>Number((await db.$queryRaw`SELECT quantity FROM stock_parts WHERE id=${p}`)[0].quantity);
 const a=await make();await svc.save(a,[{partId:p,quantity:3}]);assert.equal(await balance(),10);
 assert.equal((await svc.list()).find(x=>x.id===p).planned,3);
 await db.order.update({where:{id:a},data:{status:'DONE'}});assert.equal(await balance(),7);
 await db.order.update({where:{id:a},data:{status:'DONE'}});assert.equal(await balance(),7);
 await svc.save(a,[{partId:p,quantity:4}]);assert.equal(await balance(),6);
 await svc.save(a,[]);assert.equal(await balance(),10);
 await svc.save(a,[{partId:p,quantity:2}]);assert.equal(await balance(),8);
 await db.order.update({where:{id:a},data:{status:'IN_PROGRESS'}});assert.equal(await balance(),10);
 await db.order.update({where:{id:a},data:{status:'DONE'}});assert.equal(await balance(),8);
 await db.order.delete({where:{id:a}});assert.equal(await balance(),10);
 const receipt={delta:2,reason:'test receipt',requestId:randomUUID()};await svc.receive(p,receipt);await svc.receive(p,receipt);assert.equal(await balance(),12);
 await assert.rejects(()=>svc.receive(p,{...receipt,delta:3}));
 await assert.rejects(()=>svc.receive(p,{delta:-13,reason:'test',requestId:randomUUID()}));assert.equal(await balance(),12);
 const b=await make(),c=await make();await svc.save(b,[{partId:p,quantity:8}]);await svc.save(c,[{partId:p,quantity:8}]);
 const concurrent=await Promise.allSettled([b,c].map(id=>db.order.update({where:{id},data:{status:'DONE'}})));assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);assert.equal(await balance(),4);
 const notDone=await db.order.findFirst({where:{id:{in:[b,c]},status:'WAITING'}});assert(notDone);
 assert.equal((await svc.order(notDone.id)).items[0].applied,0);
 const history=await svc.history();assert(history.some(x=>x.part_id===p&&x.reason==='return'&&x.order_number));
 console.log('PASS inventory: planned vs actual; close, repeat, edit, remove, reopen, delete; idempotent receipts; concurrent closure and insufficient stock rollback; history');
}finally{
 await db.order.deleteMany({where:{id:{in:orders}}});
 for(const id of parts){await db.$executeRaw`DELETE FROM stock_moves WHERE part_id=${id}`;await db.$executeRaw`DELETE FROM stock_parts WHERE id=${id}`;}
 if(client)await db.client.delete({where:{id:client.id}});await db.$disconnect();
}})().catch(e=>{console.error(e);process.exitCode=1});
