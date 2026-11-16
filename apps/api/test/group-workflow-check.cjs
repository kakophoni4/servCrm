// Run after building API: node --env-file=apps/api/.env apps/api/test/group-workflow-check.cjs
// Uses a local PostgreSQL database. Telegram transport is captured; no messages leave this process.
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { BotService } = require('../dist/bot/bot.service');
const { SalaryService } = require('../dist/salary/salary.service');
const { SettlementsService } = require('../dist/settlements/settlements.service');
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname), 'Local database required');
const p = new PrismaClient();
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const uploadRoot=fs.mkdtempSync(path.join(os.tmpdir(),'crm-doc-flow-'));
process.env.UPLOAD_DIR=uploadRoot;
const {StorageService}=require('../dist/common/storage/storage.service');
const {DocumentsService}=require('../dist/documents/documents.service');
const storage=new StorageService();
const documents=new DocumentsService(p,storage);
const tag = 'flowcheck' + Date.now();
const telegramId = String(Date.now());
const chatId = '-987654321';
const settingsKeys = new Set();
const ids = [];
let user, client, master, rule, owner;
const ownerTelegramId=String(Number(telegramId)+100);
let messageId = 100;
const messages = [], calls = [];
const settings = {
  get: async key => key === 'bot.orders.group' ? JSON.stringify({chatId:'-111111', title:'Legacy group'}) : (await p.appSetting.findUnique({where:{key}}))?.value,
  set: async (key,value) => { settingsKeys.add(key); await p.appSetting.upsert({where:{key},create:{key,value},update:{value}}); },
  getBotConfig: async () => ({enabled:true,hasToken:true}),
  testBot: async () => ({ok:true,username:'TestBot'}),
};
const svc = new BotService(p, {}, settings, documents, new SettlementsService(p, {}), new SalaryService(p));
svc.sendMessage = async (chat,text,options={}) => { assert([chatId,'-222222','-333333'].includes(String(chat))); const message={id:++messageId,chatId:String(chat),text,...options}; messages.push(message); return {ok:true,result:{message_id:message.id}}; };
svc.telegram = async (method,body) => { if(method==='getChatMember')return {ok:true,result:{status:'administrator'}}; assert(['editMessageText','answerCallbackQuery','deleteMessage'].includes(method)); calls.push({method,...body}); return {ok:true}; };
const click = (data, from=telegramId, chat=chatId) => svc.processUpdate({callback_query:{id:'q'+messageId,data,from:{id:Number(from)},message:{chat:{id:Number(chat),type:'supergroup'},message_id:50}}});
const reply = (text, prompt=messages.at(-1), from=telegramId, chat=chatId) => svc.processUpdate({message:{message_id:++messageId,chat:{id:Number(chat),type:'supergroup'},from:{id:Number(from)},reply_to_message:{message_id:prompt.id},text}});
const read = id => p.order.findUnique({where:{id},include:{payment:true}});
const buttons = async id => (await svc.groupOrderCard(id)).reply_markup.inline_keyboard.flat().map(b=>b.text);
const confirm = () => messages.at(-1).reply_markup.inline_keyboard[0][0].callback_data;
async function createOrder(extra={}) {
  const order=await p.order.create({data:{publicId:tag+ids.length,seqPrefix:tag,seq:ids.length+1,clientId:client.id,masterId:master.id,address:'Test',sourceKind:'OUR',typeTech:tag,...extra}});
  ids.push(order.id);
  await p.orderDocument.createMany({data:['CONTRACT','RECEIPT_PARTS'].map(kind=>({orderId:order.id,kind,fileName:'fixture',filePath:'test-fixture'}))});
  return order.id;
}
async function reachAddress(id) {
  assert.deepEqual(await buttons(id),['Принять']);
  await click(`gs:${id}:ON_THE_WAY`); assert.equal((await read(id)).status,'WAITING');
  await click(`ga:${id}`,Number(telegramId)+1); assert.deepEqual(await buttons(id),['Принять']);
  await click(`ga:${id}`,telegramId,'-999'); assert.deepEqual(await buttons(id),['Принять']);
  await click(`ga:${id}`); assert.deepEqual(await buttons(id),['Вышел']);
  await click(`ga:${id}`); assert.deepEqual(await buttons(id),['Вышел']);
  await click(`gs:${id}:ON_THE_WAY`); assert.equal((await read(id)).status,'ON_THE_WAY'); assert.deepEqual(await buttons(id),['На адресе']);
  await click(`gs:${id}:IN_PROGRESS`); assert.equal((await read(id)).status,'IN_PROGRESS'); assert.deepEqual(await buttons(id),['СД','Закрыть']);
}
async function close(id, text, expected) {
  await click(`gs:${id}:DONE`);
  const prompt=messages.at(-1); assert.equal(prompt.reply_markup.force_reply,true);
  await reply(text,prompt,Number(telegramId)+1); assert.equal(messages.at(-1),prompt);assert(!calls.some(c=>c.method==='deleteMessage'&&c.message_id===prompt.id));
  await reply(text,prompt);assert(calls.some(c=>c.method==='deleteMessage'&&c.message_id===prompt.id&&c.chat_id===chatId));
  assert(!messages.at(-1).text.includes('На Авито:')); assert(!messages.at(-1).text.includes('Владельцу:'));
  const token=confirm(); assert.notEqual((await read(id)).status,'DONE');
  const inputId=JSON.parse(await settings.get('bot.flow.confirm.'+token.slice(3))).inputMessageId;
  assert(Number.isInteger(inputId));
  assert(!calls.some(c=>c.method==='deleteMessage'&&c.message_id===inputId));
  await click(token,Number(telegramId)+1); assert.notEqual((await read(id)).status,'DONE');
  await click(token);
  const order=await read(id); assert.equal(order.status,'DONE'); assert(order.completedAt);
  assert(calls.some(c=>c.method==='deleteMessage'&&c.message_id===inputId&&c.chat_id===chatId));
  assert(calls.some(c=>c.method==='answerCallbackQuery'&&c.text==='Заявка закрыта'&&c.show_alert===false));
  assert(!calls.some(c=>c.method==='editMessageText'&&c.text==='Заявка закрыта'));
  assert(calls.some(c=>c.method==='deleteMessage'&&c.message_id===50&&c.chat_id===chatId));
  for(const [field,value] of Object.entries(expected)) assert.equal(Number(order.payment[field]),value,field);
  assert.deepEqual(await buttons(id),[]);
  const cash=await p.cashTx.findMany({where:{orderId:id}}); assert.equal(cash.length,1); assert.equal(Number(cash[0].amount),expected.toCompany);
  await Promise.all([click(token),click(token)]); await click(`gs:${id}:DONE`);
  assert.equal(await p.cashTx.count({where:{orderId:id}}),1);
  assert.equal((await read(id)).completedAt.toISOString(),order.completedAt.toISOString());
  assert(calls.some(c=>c.method==='editMessageText' && c.text.endsWith(`Всего: ${Number(order.payment.paid)} ₽\nЧистыми: ${Number(order.payment.paid)-Number(order.payment.partsCost)} ₽`) && c.reply_markup.inline_keyboard.length===0));
}
(async()=>{
  try {
    user=await p.user.create({data:{login:tag,passwordHash:'test-no-login',fullName:'Workflow test',role:'MASTER',telegramId,masterProfile:{create:{}}},include:{masterProfile:true}}); master=user.masterProfile;
    client=await p.client.create({data:{name:'Workflow test',phoneNormalized:tag}});
    rule=await p.salaryCategory.create({data:{typeTech:tag,masterId:master.id,minSum:0,percent:0.5,reinvestPct:0.5}});
    const link=await svc.createMasterGroupLink(master.id);
    const token=link.command.split(' ').at(-1);
    await assert.rejects(()=>svc.bindMasterGroup(master.id,token,{id:Number(telegramId),type:'private'},telegramId));
    await svc.bindMasterGroup(master.id,token,{id:Number(chatId),type:'supergroup',title:'Master group'},telegramId);
    settingsKeys.add('bot.master.group.'+master.id);
    await assert.rejects(()=>svc.bindMasterGroup(master.id,token,{id:Number(chatId),type:'supergroup'},telegramId));
    assert.equal((await svc.getMasterGroup(master.id)).chatId,chatId);
    const routing=await createOrder();
    await svc.notifyMasterOrder(master.id,routing);
    assert.equal(messages.length,1); assert(messages[0].text.includes('Workflow test'));
    await svc.sendOrderToGroup(routing,true); assert.equal(messages.length,2);
    await svc.disconnectMasterGroup(master.id);
    await assert.rejects(()=>svc.sendOrderToGroup(routing,true));
    await click(`ga:${routing}`); assert.deepEqual(await buttons(routing),['Принять']);
    await settings.set('bot.master.group.'+master.id,JSON.stringify({chatId,title:'Master group'}));
    console.log('PASS master group binding, one-time code, private-chat rejection, group-only routing, disconnect');
    for(const [kind,destination] of [['owner','-222222'],['center','-333333']]){
      const link=await svc.createGroupLink(kind); assert(link.command.startsWith('/connect_'+kind+'@'));
      await svc.bindOrderGroup(link.command.split(' ').at(-1),{id:Number(destination),type:'supergroup',title:kind},telegramId,kind);
      settingsKeys.add('bot.orders.group.'+kind);
    }
    const personal=await createOrder({masterId:null,isPersonal:true});
    await svc.sendOrderToGroup(personal,true); assert.equal(messages.at(-1).chatId,'-222222');assert(messages.at(-1).text.includes('Исполнитель: владелец'));
    const center=await createOrder({masterId:null,isServiceCenter:true});
    await svc.sendOrderToGroup(center,true); assert.equal(messages.at(-1).chatId,'-333333');
    const unassigned=await createOrder({masterId:null});await svc.sendOrderToGroup(unassigned,true);assert.equal(messages.at(-1).chatId,'-222222');
    await svc.disconnectGroup('center');await assert.rejects(()=>svc.sendOrderToGroup(center,true));
    console.log('PASS owner and service-center routing without master, center priority, no fallback when disconnected');
    owner=await p.user.create({data:{login:tag+'owner',passwordHash:'test-no-login',fullName:'Owner test',role:'OWNER'}});
    const ownerLink=await svc.createOwnerLink(owner.id);const ownerPayload=new URL(ownerLink.url).searchParams.get('start');
    await assert.rejects(()=>svc.bindOwner(ownerPayload,ownerTelegramId,'-222222'));
    await svc.bindOwner(ownerPayload,ownerTelegramId,ownerTelegramId);
    await assert.rejects(()=>svc.bindOwner(ownerPayload,ownerTelegramId,ownerTelegramId));
    assert.equal((await svc.ownerConnection(owner.id)).connected,true);
    await settings.set('bot.orders.group.center',JSON.stringify({chatId:'-333333',title:'Center'}));
    async function reachAs(id,actor,chat){
      const before=messages.length;await svc.sendOrderToGroup(id,true);assert.equal(messages.length,before+1);assert.equal(messages.at(-1).chatId,chat);assert.deepEqual(await buttons(id),['Принять']);
      await click(`ga:${id}`,actor,'-999');assert.deepEqual(await buttons(id),['Принять']);
      await click(`ga:${id}`,Number(telegramId)+555,chat);assert.deepEqual(await buttons(id),['Принять']);
      await click(`gs:${id}:DONE`,actor,chat);assert.equal((await read(id)).status,'WAITING');
      await click(`ga:${id}`,actor,chat);
      if((await read(id)).isServiceCenter){
        assert.equal((await read(id)).status,'IN_PROGRESS');assert.deepEqual(await buttons(id),['Указать срок','Закрыть']);
        await click(`gs:${id}:ON_THE_WAY`,actor,chat);assert.equal((await read(id)).status,'IN_PROGRESS');
        return;
      }
      assert.deepEqual(await buttons(id),['Вышел']);assert.equal(calls.at(-1).show_alert,undefined);
      await click(`gs:${id}:ON_THE_WAY`,actor,chat);assert.equal((await read(id)).status,'ON_THE_WAY');assert.deepEqual(await buttons(id),['На адресе']);
      await click(`gs:${id}:IN_PROGRESS`,actor,chat);assert.equal((await read(id)).status,'IN_PROGRESS');assert.deepEqual(await buttons(id),['СД','Закрыть']);
    }
    async function closeAs(id,actor,chat,expected){
      await click(`gs:${id}:DONE`,actor,chat);await reply('11000 1000',messages.at(-1),actor,chat);
      const token=confirm();assert.notEqual((await read(id)).status,'DONE');
      const own=!(await read(id)).masterId;
      assert.equal(messages.at(-1).text.includes('На Авито:'),own);
      await click(token,Number(telegramId)+555,chat);assert.notEqual((await read(id)).status,'DONE');
      await Promise.all([click(token,actor,chat),click(token,actor,chat)]);const done=await read(id);assert.equal(done.status,'DONE');
      for(const [key,value] of Object.entries(expected))assert.equal(Number(done.payment[key]),value,key);
      assert.deepEqual(await buttons(id),[]);assert(done.completedAt);
      assert.equal(Number(done.payment.paid),11000);assert.equal(Number(done.payment.partsCost),1000);
      assert.equal(Number(done.payment.masterSalary)+Number(done.payment.reinvestAmount)+Number(done.payment.ownerNet),10000);
      const cash=await p.cashTx.findMany({where:{orderId:id}});assert.equal(cash.length,1);assert.equal(Number(cash[0].amount),Number(done.payment.toCompany));
      if(own)assert.equal(done.isPersonal,!done.isServiceCenter);
      await click(token,actor,chat);assert.equal(await p.cashTx.count({where:{orderId:id}}),1);
    }
    await click(`ga:${personal}`,telegramId,'-222222');assert.deepEqual(await buttons(personal),['Принять']);
    await reachAs(personal,ownerTelegramId,'-222222');
    await closeAs(personal,ownerTelegramId,'-222222',{paid:11000,masterSalary:0,toCompany:10000,reinvestAmount:3000,ownerNet:7000});
    await reachAs(center,ownerTelegramId,'-333333');
    await click(`gs:${center}:IN_PROGRESS_SD`,ownerTelegramId,'-333333');await reply('5000 пред\nСрок 5-7 дней',messages.at(-1),ownerTelegramId,'-333333');await click(confirm(),ownerTelegramId,'-333333');
    assert.equal((await read(center)).status,'IN_PROGRESS_SD');
    await closeAs(center,ownerTelegramId,'-333333',{paid:11000,prepay:5000,masterSalary:0,toCompany:10000,reinvestAmount:3000,ownerNet:7000});
    for(const actor of [ownerTelegramId,telegramId]){
      const assigned=await createOrder({isServiceCenter:true});await reachAs(assigned,actor,'-333333');
      await closeAs(assigned,actor,'-333333',{masterSalary:5000,toCompany:5000,reinvestAmount:1500,ownerNet:3500});
    }
    for(const scenario of [
      {personal:true,center:false,sd:true,actor:ownerTelegramId,assigned:false},
      {personal:false,center:true,sd:false,actor:ownerTelegramId,assigned:false},
      {personal:false,center:true,sd:true,actor:ownerTelegramId,assigned:true},
      {personal:false,center:true,sd:true,actor:telegramId,assigned:true},
    ]){
      const id=await createOrder({isPersonal:scenario.personal,isServiceCenter:scenario.center,masterId:scenario.assigned?master.id:null});
      const dest=scenario.center?'-333333':'-222222';
      await reachAs(id,scenario.actor,dest);
      if(scenario.sd){
        await click(`gs:${id}:IN_PROGRESS_SD`,scenario.actor,dest);await reply('5000 пред\nСрок 5-7 дней',messages.at(-1),scenario.actor,dest);
        assert.equal((await read(id)).status,'IN_PROGRESS');await click(confirm(),scenario.actor,dest);
        const pending=await read(id);assert.equal(pending.status,'IN_PROGRESS_SD');assert.equal(Number(pending.payment.prepay),5000);assert(pending.sdDueAt>pending.sdDueFrom);
        assert.deepEqual(await buttons(id),['Закрыть']);assert.equal(await p.cashTx.count({where:{orderId:id}}),0);
      }
      await click(`gs:${id}:DONE`,scenario.actor,dest);await reply('11000 12000',messages.at(-1),scenario.actor,dest);assert(messages.at(-1).text.includes('превышать'));
      await reply('11000 1000',messages.at(-1),scenario.actor,dest);const cancel=confirm().replace('gf:','gx:');await click(cancel,scenario.actor,dest);assert.notEqual((await read(id)).status,'DONE');
      const salary=scenario.assigned?5000:0;const company=10000-salary;const avito=company*0.3;
      await closeAs(id,scenario.actor,dest,{masterSalary:salary,toCompany:company,reinvestAmount:avito,ownerNet:company-avito,prepay:scenario.sd?5000:0});
    }
    const example=await createOrder({isPersonal:true,masterId:null});await reachAs(example,ownerTelegramId,'-222222');
    await click(`gs:${example}:DONE`,ownerTelegramId,'-222222');assert.equal(calls.at(-1).show_alert,undefined);
    await reply('11700 2300',messages.at(-1),ownerTelegramId,'-222222');
    const oldToken=confirm();const oldKey='bot.flow.confirm.'+oldToken.slice(3);const draft=JSON.parse(await settings.get(oldKey));draft.calc.reinvestPct=0.5;await settings.set(oldKey,JSON.stringify(draft));
    await click(oldToken,ownerTelegramId,'-222222');assert.equal((await read(example)).status,'IN_PROGRESS');assert.equal(calls.at(-1).show_alert,true);
    await click(`gs:${example}:DONE`,ownerTelegramId,'-222222');await reply('11700 2300',messages.at(-1),ownerTelegramId,'-222222');await click(confirm(),ownerTelegramId,'-222222');
    const exampleDone=await read(example);assert.equal(exampleDone.status,'DONE');assert.equal(Number(exampleDone.payment.reinvestAmount),2820);assert.equal(Number(exampleDone.payment.ownerNet),6580);assert.equal(calls.at(-1).show_alert,false);assert.equal(calls.at(-1).text,'Заявка закрыта');
    console.log('PASS screenshot amounts 11700/2300 -> 2820/6580, closure toast and rejected stale 50/50 confirmation');
    console.log('PASS full owner/center matrix: direct and SD, both authorized actors, routing, exact buttons, cancellation, concurrent confirmation');
    const partnerId=String(Number(telegramId)+777);
    const partnerLink=await svc.createPartnerLink(owner.id);const partnerPayload=new URL(partnerLink.url).searchParams.get('start');
    await assert.rejects(()=>svc.bindPartner(partnerPayload,partnerId,'-222222'));
    await svc.bindPartner(partnerPayload,partnerId,partnerId);settingsKeys.add('owner.partner.'+owner.id);
    await assert.rejects(()=>svc.bindPartner(partnerPayload,partnerId,partnerId));
    for(const special of [{isPersonal:true,isServiceCenter:false,masterId:null,chat:'-222222'},{isPersonal:false,isServiceCenter:true,masterId:master.id,chat:'-333333'}]){
      const {chat,...data}=special;const id=await createOrder(data);await reachAs(id,partnerId,chat);
      await closeAs(id,partnerId,chat,special.masterId?{masterSalary:5000,reinvestAmount:1500,ownerNet:3500}:{masterSalary:0,reinvestAmount:3000,ownerNet:7000});
    }
    const revoked=await createOrder({isPersonal:true,masterId:null});await reachAs(revoked,partnerId,'-222222');
    await click(`gs:${revoked}:DONE`,partnerId,'-222222');await reply('11000 1000',messages.at(-1),partnerId,'-222222');const revokedToken=confirm();
    await svc.disconnectPartner(owner.id);await click(revokedToken,partnerId,'-222222');assert.equal((await read(revoked)).status,'IN_PROGRESS');
    const blocked=await createOrder();await click(`ga:${blocked}`,partnerId,chatId);assert.deepEqual(await buttons(blocked),['Принять']);
    const dualLink=await svc.createOwnerLink(owner.id);await svc.bindOwner(new URL(dualLink.url).searchParams.get('start'),telegramId,telegramId);
    assert.equal((await p.user.findUnique({where:{id:user.id}})).telegramId,telegramId);
    assert.equal((await p.user.findUnique({where:{id:owner.id}})).telegramId,telegramId);
    await svc.groupActor({masterId:null,isPersonal:true,isServiceCenter:false},telegramId);
    await svc.masterByTelegram(telegramId);
    console.log('PASS partner binding, both chat actions, revocation before confirmation, restricted master group, dual owner/master identity');
    console.log('PASS owner binding, personal owner-only actions, SD without master 30/70, center assigned master and owner actions');
    const direct=await createOrder(); await reachAddress(direct);
    await close(direct,'12000 1000',{paid:12000,prepay:0,partsCost:1000,workSum:11000,masterSalary:5500,toCompany:5500,reinvestAmount:2750,ownerNet:2750});
    console.log('PASS direct: accept -> depart -> arrive -> close; 5500 / 2750 / 2750');
    const sd=await createOrder(); await reachAddress(sd);
    await click(`gs:${sd}:IN_PROGRESS_SD`); await reply('5000 пред\nСрок 5-7 дней');
    assert.equal((await read(sd)).status,'IN_PROGRESS'); await click(confirm());
    const inSd=await read(sd); assert.equal(inSd.status,'IN_PROGRESS_SD'); assert.equal(Number(inSd.payment.prepay),5000);
    assert.equal(inSd.sdDueAt-inSd.sdDueFrom,2*86400000); assert.equal(inSd.sdDueAt.getUTCHours(),20);
    assert.deepEqual(await buttons(sd),['Закрыть']); assert.equal(await p.cashTx.count({where:{orderId:sd}}),0);
    await p.order.update({where:{id:sd},data:{sdDueAt:new Date(Date.now()-86400000)}});
    assert((await svc.groupOrderCard(sd)).text.includes('Срок истёк'));
    await click(`gs:${sd}:DONE`); await reply('4000 1000'); assert(messages.at(-1).text.includes('меньше предоплаты'));
    await reply('11000 12000'); assert(messages.at(-1).text.includes('превышать оплату'));
    await reply('11000 1000 5000'); assert(messages.at(-1).reply_markup.force_reply);
    await reply('отмена'); assert.equal((await read(sd)).status,'IN_PROGRESS_SD');
    await close(sd,'11000 1000',{paid:11000,prepay:5000,partsCost:1000,workSum:10000,masterSalary:5000,toCompany:5000,reinvestAmount:2500,ownerNet:2500});
    console.log('PASS SD: advance + deadline + overdue + closing; advance counted once');
    await p.salaryCategory.update({where:{id:rule.id},data:{percent:0.4,reinvestPct:0.3}});
    const custom=await createOrder(); await reachAddress(custom);
    await close(custom,'12000 1000',{paid:12000,partsCost:1000,workSum:11000,masterSalary:4400,toCompany:6600,reinvestAmount:1980,ownerNet:4620});
    console.log('PASS custom percentages: 40% master, 30% Avito from owner share');
    const settlement=await p.masterSettlement.findFirst({where:{masterId:master.id}});
    assert.equal(Number(settlement.amount),42100);
    await p.user.update({where:{id:owner.id},data:{telegramId:ownerTelegramId}});
    const docOrder=await createOrder({isPersonal:true,masterId:null,status:'IN_PROGRESS'});
    await p.orderDocument.deleteMany({where:{orderId:docOrder}});
    await click(`gs:${docOrder}:DONE`,ownerTelegramId,'-222222');
    await reply('10000 3500',messages.at(-1),ownerTelegramId,'-222222');
    assert(messages.at(-1).text.includes('акт выполненных работ'));
    let prompt=messages.at(-1),step=confirm();
    await click('gf:'+step.slice(3),ownerTelegramId,'-222222');
    assert.equal((await read(docOrder)).status,'IN_PROGRESS');
    assert(calls.at(-1).text.includes('Загрузите акт'));
    let downloadCount=0;
    svc.downloadTgFile=async msg=>{downloadCount++;const buffer=Buffer.from(msg.document.file_id);return {buffer,size:buffer.length,mimetype:'image/jpeg',originalname:'scan.jpg'}};
    const upload=async(id,from=ownerTelegramId,chat='-222222')=>svc.processUpdate({message:{message_id:++messageId,chat:{id:Number(chat),type:'supergroup'},from:{id:Number(from)},reply_to_message:{message_id:prompt.id},document:{file_id:id,file_name:'scan.jpg'}}});
    await upload('foreign',telegramId);assert.equal(downloadCount,0);
    await upload('wrongchat',ownerTelegramId,'-333333');assert.equal(downloadCount,0);
    await upload('act-image');await upload('act-image');
    assert.equal(await p.orderDocument.count({where:{orderId:docOrder,kind:'CONTRACT'}}),1);
    let stored=await p.orderDocument.findFirst({where:{orderId:docOrder,kind:'CONTRACT'}});
    assert.equal(fs.readFileSync(path.join(uploadRoot,stored.filePath),'utf8'),'act-image');
    assert.equal(stored.uploadedBy,owner.id);
    assert.equal((await read(docOrder)).status,'IN_PROGRESS');
    assert.equal((await read(docOrder)).scheduledAt,null);
    await click(step,ownerTelegramId,'-222222');
    assert(messages.at(-1).text.includes('чеки на расходы'));
    prompt=messages.at(-1);step=confirm();
    await upload('receipt-one');await upload('receipt-two');
    assert.equal(await p.orderDocument.count({where:{orderId:docOrder,kind:'RECEIPT_PARTS'}}),2);
    await click(step,ownerTelegramId,'-222222');
    assert(confirm().startsWith('gf:'));
    const finalToken=confirm();
    await p.orderDocument.updateMany({where:{orderId:docOrder,kind:'RECEIPT_PARTS'},data:{pendingReview:true}});
    await click(finalToken,ownerTelegramId,'-222222');assert.equal((await read(docOrder)).status,'IN_PROGRESS');
    await p.orderDocument.updateMany({where:{orderId:docOrder,kind:'RECEIPT_PARTS'},data:{pendingReview:false}});
    await click(finalToken,ownerTelegramId,'-222222');
    assert.equal((await read(docOrder)).status,'DONE');
    const zeroCost=await createOrder({isPersonal:true,masterId:null,status:'IN_PROGRESS'});
    await p.orderDocument.deleteMany({where:{orderId:zeroCost,kind:'RECEIPT_PARTS'}});
    await click(`gs:${zeroCost}:DONE`,ownerTelegramId,'-222222');await reply('1000 0',messages.at(-1),ownerTelegramId,'-222222');
    assert(confirm().startsWith('gf:'));await click(confirm(),ownerTelegramId,'-222222');assert.equal((await read(zeroCost)).status,'DONE');
    console.log('PASS mandatory act and expense receipts, actual file storage, duplicate files, foreign senders/chats, no expenses, closure gate');
    // One complete journey: bot documents -> close -> Telegram report -> CRM receipts.
    const {SettlementsController}=require('../dist/settlements/settlements.controller');
    const {randomUUID}=require('node:crypto');
    const cashService=new SettlementsService(p,{}),cashController=new SettlementsController(cashService);
    const actor={userId:owner.id,role:'OWNER'};
    async function receive(amount,requestId=randomUUID()){
      settingsKeys.add('cash.receipt.'+owner.id+'.'+requestId);
      return cashController.receiveCash({masterId:master.id,amount,requestId},actor);
    }
    const previousDebt=(await cashService.cashBalance(master.id)).remaining;
    if(previousDebt)await receive(previousDebt);
    await p.salaryCategory.update({where:{id:rule.id},data:{percent:0.5,reinvestPct:0.5}});
    const chain=await createOrder({status:'IN_PROGRESS',scheduledAt:new Date()});
    await p.orderDocument.deleteMany({where:{orderId:chain}});
    await click(`gs:${chain}:DONE`);await reply('12000 1000');
    assert(messages.at(-1).text.includes('акт выполненных работ'));
    prompt=messages.at(-1);step=confirm();
    await upload('chain-act',telegramId,chatId);await click(step);
    assert(messages.at(-1).text.includes('чеки на расходы'));
    prompt=messages.at(-1);step=confirm();
    await upload('chain-receipt',telegramId,chatId);await click(step);
    const closeToken=confirm();await click(closeToken);
    const done=await read(chain);assert.equal(done.status,'DONE');
    assert.equal(Number(done.payment.paid),12000);assert.equal(Number(done.payment.partsCost),1000);
    assert.equal(Number(done.payment.masterSalary),5500);assert.equal(Number(done.payment.toCompany),5500);
    const files=await p.orderDocument.findMany({where:{orderId:chain}});assert.equal(files.length,2);
    for(const file of files)assert(fs.existsSync(path.join(uploadRoot,file.filePath)));
    async function compareDebt(expected){
      const crm=(await cashController.cash()).find(row=>row.masterId===master.id);
      assert.equal(crm.remaining,expected);
      await svc.processUpdate({message:{from:{id:Number(telegramId)},chat:{id:Number(chatId),type:'supergroup'},text:'касса'}});
      const match=/К сдаче за всё время: ([\d\s.,]+) ₽/.exec(messages.at(-1).text);
      assert(match,'Telegram cash report was not produced');
      const telegram=Number(match[1].replace(/\s/g,'').replace(',','.'));
      assert.equal(telegram,crm.remaining);
      console.log(`PASS combined flow: CRM debt = Telegram debt = ${expected}`);
    }
    await compareDebt(5500);
    const partialId=randomUUID();await receive(2000,partialId);await compareDebt(3500);
    await receive(2000,partialId);await compareDebt(3500);
    await receive(3500);await compareDebt(0);
    await click(closeToken);await compareDebt(0);
    assert.equal(await p.cashTx.count({where:{orderId:chain}}),1);
    assert.equal((await read(chain)).status,'DONE');
    console.log('PASS combined documents/closure/cash journey: 12000 paid, 1000 expenses, 5500 to hand over; partial/full receipts, duplicate receipt and closure');

    console.log('PASS settlement total, invalid input, foreign users/chats, cancellation, duplicate callbacks');
  } finally {
    await p.cashTx.deleteMany({where:{orderId:{in:ids}}});
    await p.order.deleteMany({where:{id:{in:ids}}});
    await p.appSetting.deleteMany({where:{key:{in:[...settingsKeys]}}});
    if(rule)await p.salaryCategory.delete({where:{id:rule.id}});
    if(master){await p.masterSettlement.deleteMany({where:{masterId:master.id}});await p.master.delete({where:{id:master.id}});}
    if(owner)await p.user.delete({where:{id:owner.id}});
    if(user)await p.user.delete({where:{id:user.id}});
    if(client)await p.client.delete({where:{id:client.id}});
    await p.$disconnect();
    if(path.dirname(uploadRoot)!==path.resolve(os.tmpdir()) || !path.basename(uploadRoot).startsWith('crm-doc-flow-'))throw new Error('Unexpected test cleanup path');
    fs.rmSync(uploadRoot,{recursive:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
