import { createHash } from 'crypto';
import { BotService } from './bot.service';

describe('Assignment group', () => {
  const code='a'.repeat(32);
  function setup(telegramId:string|null=null) {
    let pending:string|null=JSON.stringify({hash:createHash('sha256').update(code).digest('hex'),expires:Date.now()+10000});
    const appSetting={findUnique:jest.fn(async()=>pending?{value:pending}:null),deleteMany:jest.fn(async()=>{const count=pending?1:0;pending=null;return {count};}),upsert:jest.fn()};
    const prisma:any={appSetting,$transaction:jest.fn(async f=>f({appSetting})),master:{findUnique:jest.fn(async()=>({user:{fullName:'Master',telegramId}}))},order:{findUnique:jest.fn(async()=>({id:'o',masterId:'m',status:'WAITING',master:{user:{fullName:'Master'}},publicId:'123',client:{name:'Client',phoneNormalized:'7999'},address:'Address',isPersonal:false})),update:jest.fn()}};
    const settings:any={set:jest.fn(),getBotConfig:jest.fn(async()=>({hasToken:true,enabled:true})),get:jest.fn(async(key:string)=>key==='bot.orders.group'?JSON.stringify({chatId:'-123',title:'Orders'}):null)};
    const svc=new BotService(prisma,{} as any,settings,{} as any,{} as any,{} as any);
    jest.spyOn(svc,'telegram').mockResolvedValue({ok:true,result:{status:'administrator'}});
    const send=jest.spyOn(svc,'sendMessage').mockResolvedValue({ok:true,result:{message_id:1}});
    jest.spyOn(svc,'clearMasterOrderCard' as any).mockResolvedValue(undefined);
    return {svc,send,prisma,appSetting,settings};
  }
  it('shows total and total minus expenses, without adding prepayment or revealing owner shares to masters',async()=>{
    const {svc,prisma}=setup();
    const order=await prisma.order.findUnique();
    prisma.order.findUnique.mockResolvedValue({...order,status:'DONE',comment:'Ремонт',payment:{paid:11700,partsCost:2300,prepay:5000,reinvestAmount:2820,ownerNet:6580}});
    const card=await (svc as any).groupOrderCard('o');
    expect(card.text).toContain('ФИО: Client');
    expect(card.text).toContain('Примечание: Ремонт');
    expect(card.text).toMatch(/Всего: 11700 ₽\nЧистыми: 9400 ₽$/);
    expect(card.text).not.toMatch(/На Авито|Владельцу/);
  });
  it('refreshes an existing bot card in place without sending another order or changing its status',async()=>{
    const {svc,send,prisma}=setup();jest.spyOn(svc,'masterByTelegram').mockResolvedValue({id:'u',masterProfile:{id:'m'}} as any);
    jest.spyOn(svc,'telegram').mockResolvedValue({ok:true,result:{id:123}});
    await svc.processUpdate({message:{text:'/refresh',from:{id:456},chat:{id:-123,type:'supergroup'},reply_to_message:{message_id:77,from:{id:123},text:'Заявка 123\nСтатус: Ожидание'}}});
    expect(svc.telegram).toHaveBeenCalledWith('editMessageReplyMarkup',{chat_id:'-123',message_id:77,reply_markup:{inline_keyboard:[[{text:'Принять',callback_data:'ga:o'}]]}});
    expect(send).not.toHaveBeenCalled();expect(prisma.order.update).not.toHaveBeenCalled();
  });
  it('refuses to refresh forged cards and cards in another chat',async()=>{
    const {svc}=setup();jest.spyOn(svc,'telegram').mockResolvedValue({ok:true,result:{id:123}});
    for(const [sender,chat] of [[999,-123],[123,-999]])await svc.processUpdate({message:{text:'/refresh',from:{id:456},chat:{id:chat,type:'supergroup'},reply_to_message:{message_id:77,from:{id:sender},text:'Заявка 123\nСтатус: Ожидание'}}});
    expect(svc.telegram).not.toHaveBeenCalledWith('editMessageReplyMarkup',expect.anything());
  });
  it('binds a group once and consumes the code',async()=>{const {svc,appSetting}=setup();await svc.bindOrderGroup(code,{id:-123,type:'supergroup',title:'Orders'},'456');expect(appSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({update:{value:JSON.stringify({chatId:'-123',title:'Orders'})}}));await expect(svc.bindOrderGroup(code,{id:-123,type:'supergroup'},'456')).rejects.toThrow();});
  it('rejects private chats, bad codes and non-admins without consuming code',async()=>{const {svc,appSetting}=setup();await expect(svc.bindOrderGroup(code,{id:456,type:'private'},'456')).rejects.toThrow();await expect(svc.bindOrderGroup('b'.repeat(32),{id:-123,type:'group'},'456')).rejects.toThrow();jest.spyOn(svc,'telegram').mockResolvedValue({ok:true,result:{status:'member'}});await expect(svc.bindOrderGroup(code,{id:-123,type:'group'},'456')).rejects.toThrow();expect(appSetting.deleteMany).not.toHaveBeenCalled();});
  it('rejects expired codes',async()=>{const {svc,appSetting}=setup();appSetting.findUnique.mockResolvedValue({value:JSON.stringify({hash:createHash('sha256').update(code).digest('hex'),expires:0})});await expect(svc.bindOrderGroup(code,{id:-123,type:'group'},'456')).rejects.toThrow();expect(appSetting.deleteMany).not.toHaveBeenCalled();});
  it('sends to group even without a linked master',async()=>{const {svc,send}=setup();const r=await svc.notifyMasterOrder('m','o');expect(send).toHaveBeenCalledTimes(1);expect(send).toHaveBeenCalledWith('-123',expect.stringContaining('Мастер: Master'),expect.any(Object));expect(r).toMatchObject({ok:false,groupSent:true});});
  it('keeps private delivery independent of failed group delivery',async()=>{const {svc,send}=setup('456');send.mockResolvedValueOnce({ok:false}).mockResolvedValueOnce({ok:true,result:{message_id:2}});const r=await svc.notifyMasterOrder('m','o');expect(r).toMatchObject({ok:true,groupSent:false});expect(send).toHaveBeenLastCalledWith('456',expect.any(String));});
  it('does not send stale assignments or leak personal orders without an owner chat',async()=>{const {svc,send,prisma}=setup();prisma.order.findUnique.mockResolvedValue({masterId:'other'});await svc.notifyMasterOrder('m','o');expect(send).not.toHaveBeenCalled();prisma.order.findUnique.mockResolvedValue({id:'o',masterId:'m',isPersonal:true,client:{name:'Client',phoneNormalized:'7999'}});await expect(svc.notifyMasterOrder('m','o')).rejects.toThrow('Подключите «Мой чат»');expect(send).not.toHaveBeenCalled();});
  it('ignores ordinary group messages',async()=>{const {svc}=setup();const ingest=jest.spyOn(svc,'incomingMessage');await svc.processUpdate({message:{chat:{id:-123,type:'group'},from:{id:456},text:'hello'}});expect(ingest).not.toHaveBeenCalled();});
  it('group-only send never sends a private copy and includes status buttons',async()=>{
    const {svc,send}=setup('456');await svc.sendOrderToGroup('o');expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('-123',expect.any(String),{reply_markup:{inline_keyboard:[[{text:'Принять',callback_data:'ga:o'}]]}});
  });
  it('rejects group actions from another master or another chat',async()=>{
    const {svc}=setup();jest.spyOn(svc,'masterByTelegram').mockResolvedValue({masterProfile:{id:'other'}} as any);const set=jest.spyOn(svc,'setStatus');
    await svc.processUpdate({callback_query:{id:'q',from:{id:456},message:{chat:{id:-123},message_id:1},data:'gs:o:ON_THE_WAY'}});
    await svc.processUpdate({callback_query:{id:'q2',from:{id:456},message:{chat:{id:-999},message_id:1},data:'gs:o:ON_THE_WAY'}});
    expect(set).not.toHaveBeenCalled();expect(svc.telegram).toHaveBeenCalledWith('answerCallbackQuery',expect.objectContaining({show_alert:true}));
  });
  it('applies a status for the assigned master and refreshes the group message',async()=>{
    const {svc,settings}=setup();settings.get.mockImplementation(async(key:string)=>key.startsWith('bot.orders.accepted.')?'m':key==='bot.orders.group'?JSON.stringify({chatId:'-123',title:'Orders'}):null);jest.spyOn(svc,'masterByTelegram').mockResolvedValue({masterProfile:{id:'m'}} as any);const set=jest.spyOn(svc,'setStatus').mockResolvedValue({} as any);
    await svc.processUpdate({callback_query:{id:'q',from:{id:456},message:{chat:{id:-123},message_id:9},data:'gs:o:ON_THE_WAY'}});
    expect(set).toHaveBeenCalledWith('456','o','ON_THE_WAY',true);expect(svc.telegram).toHaveBeenCalledWith('editMessageText',expect.objectContaining({chat_id:'-123',message_id:9}));
  });
  it('does not complete an order without payment',async()=>{
    const {svc}=setup();jest.spyOn(svc,'masterByTelegram').mockResolvedValue({masterProfile:{id:'m'}} as any);const set=jest.spyOn(svc,'setStatus');
    await svc.processUpdate({callback_query:{id:'q',from:{id:456},message:{chat:{id:-123},message_id:1},data:'gs:o:DONE'}});expect(set).not.toHaveBeenCalled();
  });
  it('accepts only the current assignment without changing its status',async()=>{
    const {svc,prisma}=setup();jest.spyOn(svc,'masterByTelegram').mockResolvedValue({masterProfile:{id:'m'}} as any);prisma.order.updateMany=jest.fn(async()=>({count:1}));
    await svc.processUpdate({callback_query:{id:'q',from:{id:456},message:{chat:{id:-123},message_id:1},data:'ga:o'}});
    expect(prisma.order.updateMany).toHaveBeenCalledWith({where:{id:'o',masterId:'m',status:'WAITING',notifyAckedAt:null},data:{notifyAckedAt:expect.any(Date)}});
  });

});
