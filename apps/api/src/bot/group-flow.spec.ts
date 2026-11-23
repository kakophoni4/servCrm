import { BotService } from './bot.service';
import { parseClosingReply,parseSdReply,sdDeadline } from './group-flow';

describe('Group reply workflow',()=>{
 function setup(){
  const values=new Map<string,string>([['bot.orders.group',JSON.stringify({chatId:'-123',title:'Orders'})]]);
  const order:any={id:'o',publicId:'123',masterId:'m',status:'IN_PROGRESS',isPersonal:false,isServiceCenter:false,typeTech:'ХД',updatedAt:new Date('2026-11-16T08:00:00Z'),client:{name:'Client',phoneNormalized:'7999'},master:{user:{fullName:'Master'}},payment:{prepay:5000},cityId:'city'};
  const appSetting={findMany:jest.fn(async({where}:any)=>[...values.entries()].filter(([key])=>key.startsWith(where.key.startsWith)).map(([key,value])=>({key,value}))),count:jest.fn(async()=>0),deleteMany:jest.fn(async({where}:any)=>{if(values.has(where.key)&&(where.value===undefined||values.get(where.key)===where.value)){values.delete(where.key);return {count:1};}return {count:0};})};
  const prisma:any={user:{findFirst:jest.fn(async()=>null),findMany:jest.fn(async()=>[])},appSetting,orderDocument:{findMany:jest.fn(async()=>[{kind:'CONTRACT'},{kind:'RECEIPT_PARTS'}])},order:{findUnique:jest.fn(async()=>order),updateMany:jest.fn(async({where,data}:any)=>{if(where.updatedAt?.getTime()!==order.updatedAt.getTime())return {count:0};Object.assign(order,data,{updatedAt:new Date()});return {count:1};})},orderPayment:{upsert:jest.fn(async({update}:any)=>{order.payment={...order.payment,...update};})},cashTx:{findFirst:jest.fn(async()=>null),create:jest.fn(),update:jest.fn()}};
  prisma.$transaction=jest.fn(async(fn:any)=>{const snapshot=new Map(values),before={...order};try{return await fn(prisma);}catch(e){values.clear();snapshot.forEach((v,k)=>values.set(k,v));Object.assign(order,before);throw e;}});
  const settings:any={get:jest.fn(async(k:string)=>values.get(k)||null),set:jest.fn(async(k:string,v:string)=>values.set(k,v))};
  const terms=jest.fn(async()=>({masterPct:0.5,reinvestPct:0.5}));
  const svc=new BotService(prisma,{} as any,settings,{} as any,{syncForCompletedOrder:jest.fn().mockResolvedValue(null)} as any,{termsFor:terms} as any);
  jest.spyOn(svc,'masterByTelegram').mockResolvedValue({id:'u',masterProfile:{id:'m'}} as any);
  let message=10;const send=jest.spyOn(svc,'sendMessage').mockImplementation(async()=>({ok:true,result:{message_id:message++}}));
  const telegram=jest.spyOn(svc,'telegram').mockResolvedValue({ok:true});
  const click=(data:string,user=456)=>svc.processUpdate({callback_query:{id:'q',data,from:{id:user},message:{chat:{id:-123,type:'supergroup'},message_id:5}}});
  const reply=(text:string,user=456,replyId=10)=>svc.processUpdate({message:{message_id:20,chat:{id:-123,type:'supergroup'},from:{id:user},reply_to_message:{message_id:replyId},text}});
  const token=()=>[...values.keys()].find(k=>k.startsWith('bot.flow.confirm.'))!.replace('bot.flow.confirm.','');
  return {svc,values,order,prisma,send,telegram,terms,click,reply,token};
 }
 it('extends a repair from its current deadline once, preserves money, and refreshes the card',async()=>{
  const x=setup();
  Object.assign(x.order,{status:'IN_PROGRESS_SD',sdDueAt:new Date('2026-11-30T19:59:59.999Z'),sdComment:'Согласовано'});
  await x.click('ge:o');await x.reply('3 дня ждём деталь');
  const action='gf:'+x.token();await x.click(action);await x.click(action);
  expect(x.order.sdDueAt.toISOString()).toBe('2026-12-03T19:59:59.999Z');
  expect(x.order.sdComment).toContain('Согласовано');expect(x.order.sdComment).toContain('ждём деталь');
  expect(x.prisma.orderPayment.upsert).not.toHaveBeenCalled();expect(x.prisma.order.updateMany).toHaveBeenCalledTimes(1);
  expect(x.telegram).toHaveBeenCalledWith('editMessageText',expect.objectContaining({text:expect.stringContaining('03.12.2026')}));
 });
 it('requires a reason before extending',async()=>{
  const x=setup();Object.assign(x.order,{status:'IN_PROGRESS_SD',sdDueAt:new Date()});
  await x.click('ge:o');await x.reply('3 дня');expect(x.prisma.order.updateMany).not.toHaveBeenCalled();
  expect([...x.values.keys()].some(k=>k.startsWith('bot.flow.confirm.'))).toBe(false);
 });
 it.each(['WARRANTY','REPEAT'])('shows original amounts, equipment and problem on %s cards',async type=>{
  const x=setup();Object.assign(x.order,{type,sourceSnapshot:{publicId:'old',comment:'Шумит',typeTech:'ХД',payment:{paid:'11000',partsCost:'1000'}}});
  const card=await (x.svc as any).groupOrderCard('o');expect(card.text.split('\n')[0]).toBe((type==='WARRANTY'?'Гарантия':'Повтор')+' 123');
  for(const value of ['Исходная заявка: old','Шумит','Исходная техника: ХД','11000 ₽','10000 ₽'])expect(card.text).toContain(value);
 });
 it('removes only the answered prompt after confirmation is delivered',async()=>{const x=setup();await x.click('gs:o:DONE');await x.reply('11000 1000');expect(x.telegram).toHaveBeenCalledWith('deleteMessage',{chat_id:'-123',message_id:10});expect(x.prisma.orderPayment.upsert).not.toHaveBeenCalled();});
 it('keeps the prompt if confirmation delivery fails',async()=>{const x=setup();await x.click('gs:o:DONE');x.send.mockResolvedValueOnce({ok:false});await x.reply('11000 1000');expect(x.values.has('bot.flow.reply.-123.10')).toBe(true);expect(x.telegram).not.toHaveBeenCalledWith('deleteMessage',expect.anything());});
 it('parses exactly two amounts and rejects malformed money',()=>{expect(parseClosingReply('11000 1000')).toEqual({paid:11000,partsCost:1000});expect(parseClosingReply('11000,50 1000.25').paid).toBe(11000.5);for(const value of ['-1 0','100 20 30','11 000 1000','abc','99999999999 0'])expect(()=>parseClosingReply(value)).toThrow();});
 it('parses SD amount and variable day range',()=>{expect(parseSdReply('5000 пред\nСрок 5-7 дней')).toEqual({prepay:5000,minDays:5,maxDays:7});expect(parseSdReply('0 пред\nСрок 3 дня').maxDays).toBe(3);for(const value of ['5000 7-5','5000 0-7','5000 5-999'])expect(()=>parseSdReply(value)).toThrow();expect(sdDeadline(7,new Date('2026-11-16T22:00:00Z')).toISOString()).toBe('2026-11-24T19:59:59.999Z');});
 it('refunds a service deposit once on confirmed zero closure',async()=>{
   const x=setup();
   x.order.status='IN_PROGRESS_SD';
   await x.click('gs:o:DONE');
   await x.reply('0 0\n0');
   expect(x.order.payment.prepay).toBe(5000);
   const action='gf:'+x.token();
   await x.click(action);
   expect(x.order.payment).toMatchObject({paid:0,prepay:0,partsCost:0,masterSalary:0,ownerNet:0});
   expect(x.order.sdComment).toContain('5000');
   await x.click(action);
   expect(x.prisma.cashTx.create).toHaveBeenCalledTimes(1);
 });
 it('does not write payment until confirmation and counts advance only once',async()=>{const x=setup();await x.click('gs:o:DONE');await x.reply('11000 1000');expect(x.prisma.orderPayment.upsert).not.toHaveBeenCalled();expect(x.terms).toHaveBeenCalledWith(10000,'ХД','m');const token=x.token();await x.click('gf:'+token);expect(x.order.status).toBe('DONE');expect(x.order.payment).toMatchObject({paid:11000,prepay:5000,partsCost:1000,masterSalary:5000,reinvestAmount:2500,ownerNet:2500});expect(x.prisma.cashTx.create).toHaveBeenCalledTimes(1);await x.click('gf:'+token);expect(x.prisma.cashTx.create).toHaveBeenCalledTimes(1);});
 it('ignores replies from another master and unrelated reply targets',async()=>{const x=setup();await x.click('gs:o:DONE');await x.reply('11000 1000',999);await x.reply('11000 1000',456,999);expect(x.prisma.orderPayment.upsert).not.toHaveBeenCalled();expect([...x.values.keys()].some(k=>k.startsWith('bot.flow.confirm.'))).toBe(false);});
 it('rejects a confirmation by another person',async()=>{const x=setup();await x.click('gs:o:DONE');await x.reply('11000 1000');await x.click('gf:'+x.token(),999);expect(x.prisma.orderPayment.upsert).not.toHaveBeenCalled();});
 it('rejects reassigned or changed orders before confirmation',async()=>{const x=setup();await x.click('gs:o:DONE');await x.reply('11000 1000');x.order.masterId='other';await x.click('gf:'+x.token());expect(x.prisma.orderPayment.upsert).not.toHaveBeenCalled();});
 it('cancels without payment writes',async()=>{const x=setup();await x.click('gs:o:DONE');await x.reply('11000 1000');await x.click('gx:'+x.token());expect(x.prisma.orderPayment.upsert).not.toHaveBeenCalled();expect(x.order.status).toBe('IN_PROGRESS');});
 it('rejects expired reply sessions',async()=>{const x=setup();await x.click('gs:o:DONE');const key='bot.flow.reply.-123.10';x.values.set(key,JSON.stringify({...JSON.parse(x.values.get(key)!),expires:0}));await x.reply('11000 1000');expect([...x.values.keys()].some(k=>k.startsWith('bot.flow.confirm.'))).toBe(false);});
 it('stores SD advance and deadline without closing or creating income',async()=>{const x=setup();await x.click('gs:o:IN_PROGRESS_SD');await x.reply('5000 пред\nСрок 5-7 дней');expect(x.prisma.orderPayment.upsert).not.toHaveBeenCalled();await x.click('gf:'+x.token());expect(x.order.status).toBe('IN_PROGRESS_SD');expect(x.order.payment.prepay).toBe(5000);expect(x.order.sdDueAt.getTime()-x.order.sdDueFrom.getTime()).toBe(2*86400000);expect(x.prisma.cashTx.create).not.toHaveBeenCalled();});
 it('rejects expenses above total and totals below the advance',async()=>{for(const text of ['11000 12000','4000 1000']){const x=setup();await x.click('gs:o:DONE');await x.reply(text);expect([...x.values.keys()].some(k=>k.startsWith('bot.flow.confirm.'))).toBe(false);expect(x.prisma.orderPayment.upsert).not.toHaveBeenCalled();}});
 it('stores guarantee months and master percentage in closing',async()=>{const x=setup();await x.click('gs:o:DONE');await x.reply('11000 1000\n6');expect(x.send).toHaveBeenCalledWith('-123',expect.stringContaining('Мастеру (50%)'),expect.anything());await x.click('gf:'+x.token());expect(x.order.warrantyMonths).toBe(6);expect(x.order.payment.paid).toBe(11000)});
 it('stores SD comment and removes cancelled flow messages',async()=>{const x=setup();await x.click('gs:o:IN_PROGRESS_SD');await x.reply('5000 пред\n5-7 дней\nСогласовано 12000');await x.click('gf:'+x.token());expect(x.order.sdComment).toBe('Согласовано 12000');expect(x.order.payment.prepay).toBe(5000);const y=setup();await y.click('gs:o:IN_PROGRESS_SD');await y.reply('5000 пред\n5-7 дней');await y.click('gx:'+y.token());expect([...y.values.keys()].filter(k=>k.startsWith('bot.flow.'))).toEqual([]);expect(y.prisma.orderPayment.upsert).not.toHaveBeenCalled();expect(y.telegram).toHaveBeenCalledWith('deleteMessage',{chat_id:'-123',message_id:20})});
 it('accepts zero payment and guarantee',()=>{expect(parseClosingReply('0 0\n0')).toEqual({paid:0,partsCost:0,warrantyMonths:0})});
 it('partner closing divides net 50/50 without Avito',async()=>{const x=setup();x.order.sourceKind='PARTNER';await x.click('gs:o:DONE');await x.reply('11000 1000');await x.click('gf:'+x.token());expect(x.order.payment.masterSalary).toBe(5000);expect(x.order.payment.ownerNet).toBe(5000);expect(x.order.payment.reinvestAmount).toBe(0)});
});
