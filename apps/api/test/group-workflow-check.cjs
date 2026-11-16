// Run after building API: node --env-file=apps/api/.env apps/api/test/group-workflow-check.cjs
// Uses a local PostgreSQL database. Telegram transport is captured; no messages leave this process.
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { BotService } = require('../dist/bot/bot.service');
const { SalaryService } = require('../dist/salary/salary.service');
const { SettlementsService } = require('../dist/settlements/settlements.service');
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname), 'Local database required');
const p = new PrismaClient();
const tag = 'flowcheck' + Date.now();
const telegramId = String(Date.now());
const chatId = '-987654321';
const settingsKeys = new Set();
const ids = [];
let user, client, master, rule;
let messageId = 100;
const messages = [], calls = [];
const settings = {
  get: async key => key === 'bot.orders.group' ? JSON.stringify({chatId:'-111111', title:'Legacy group'}) : (await p.appSetting.findUnique({where:{key}}))?.value,
  set: async (key,value) => { settingsKeys.add(key); await p.appSetting.upsert({where:{key},create:{key,value},update:{value}}); },
  getBotConfig: async () => ({enabled:true,hasToken:true}),
  testBot: async () => ({ok:true,username:'TestBot'}),
};
const svc = new BotService(p, {}, settings, {}, new SettlementsService(p, {}), new SalaryService(p));
svc.sendMessage = async (chat,text,options={}) => { assert.equal(String(chat),chatId); const message={id:++messageId,text,...options}; messages.push(message); return {ok:true,result:{message_id:message.id}}; };
svc.telegram = async (method,body) => { if(method==='getChatMember')return {ok:true,result:{status:'administrator'}}; assert(['editMessageText','answerCallbackQuery'].includes(method)); calls.push({method,...body}); return {ok:true}; };
const click = (data, from=telegramId, chat=chatId) => svc.processUpdate({callback_query:{id:'q'+messageId,data,from:{id:Number(from)},message:{chat:{id:Number(chat),type:'supergroup'},message_id:50}}});
const reply = (text, prompt=messages.at(-1), from=telegramId) => svc.processUpdate({message:{message_id:++messageId,chat:{id:Number(chatId),type:'supergroup'},from:{id:Number(from)},reply_to_message:{message_id:prompt.id},text}});
const read = id => p.order.findUnique({where:{id},include:{payment:true}});
const buttons = async id => (await svc.groupOrderCard(id)).reply_markup.inline_keyboard.flat().map(b=>b.text);
const confirm = () => messages.at(-1).reply_markup.inline_keyboard[0][0].callback_data;
async function createOrder(extra={}) {
  const order=await p.order.create({data:{publicId:tag+ids.length,seqPrefix:tag,seq:ids.length+1,clientId:client.id,masterId:master.id,address:'Test',sourceKind:'OUR',typeTech:tag,...extra}});
  ids.push(order.id); return order.id;
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
  await reply(text,prompt,Number(telegramId)+1); assert.equal(messages.at(-1),prompt);
  await reply(text,prompt);
  assert(!messages.at(-1).text.includes('На Авито:')); assert(!messages.at(-1).text.includes('Владельцу:'));
  const token=confirm(); assert.notEqual((await read(id)).status,'DONE');
  await click(token,Number(telegramId)+1); assert.notEqual((await read(id)).status,'DONE');
  await click(token);
  const order=await read(id); assert.equal(order.status,'DONE'); assert(order.completedAt);
  for(const [field,value] of Object.entries(expected)) assert.equal(Number(order.payment[field]),value,field);
  assert.deepEqual(await buttons(id),[]);
  const cash=await p.cashTx.findMany({where:{orderId:id}}); assert.equal(cash.length,1); assert.equal(Number(cash[0].amount),expected.toCompany);
  await Promise.all([click(token),click(token)]); await click(`gs:${id}:DONE`);
  assert.equal(await p.cashTx.count({where:{orderId:id}}),1);
  assert.equal((await read(id)).completedAt.toISOString(),order.completedAt.toISOString());
  assert(calls.some(c=>c.method==='editMessageText' && c.text.includes('Получено всего:') && c.reply_markup.inline_keyboard.length===0));
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
    assert.equal(Number(settlement.amount),17100);
    console.log('PASS settlement total, invalid input, foreign users/chats, cancellation, duplicate callbacks');
  } finally {
    await p.cashTx.deleteMany({where:{orderId:{in:ids}}});
    await p.order.deleteMany({where:{id:{in:ids}}});
    await p.appSetting.deleteMany({where:{key:{in:[...settingsKeys]}}});
    if(rule)await p.salaryCategory.delete({where:{id:rule.id}});
    if(master){await p.masterSettlement.deleteMany({where:{masterId:master.id}});await p.master.delete({where:{id:master.id}});}
    if(user)await p.user.delete({where:{id:user.id}});
    if(client)await p.client.delete({where:{id:client.id}});
    await p.$disconnect();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
