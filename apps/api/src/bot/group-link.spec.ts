import { createHash } from 'crypto';
import { BotService } from './bot.service';

describe('Assignment group', () => {
  const code='a'.repeat(32);
  function setup(telegramId:string|null=null) {
    let pending:string|null=JSON.stringify({hash:createHash('sha256').update(code).digest('hex'),expires:Date.now()+10000});
    const appSetting={findUnique:jest.fn(async()=>pending?{value:pending}:null),deleteMany:jest.fn(async()=>{const count=pending?1:0;pending=null;return {count};}),upsert:jest.fn()};
    const prisma:any={appSetting,$transaction:jest.fn(async f=>f({appSetting})),master:{findUnique:jest.fn(async()=>({user:{fullName:'Master',telegramId}}))},order:{findUnique:jest.fn(async()=>({id:'o',masterId:'m',publicId:'123',client:{name:'Client',phoneNormalized:'7999'},address:'Address',isPersonal:false})),update:jest.fn()}};
    const settings:any={getBotConfig:jest.fn(async()=>({hasToken:true,enabled:true})),get:jest.fn(async()=>JSON.stringify({chatId:'-123',title:'Orders'}))};
    const svc=new BotService(prisma,{} as any,settings,{} as any,{} as any,{} as any);
    jest.spyOn(svc,'telegram').mockResolvedValue({ok:true,result:{status:'administrator'}});
    const send=jest.spyOn(svc,'sendMessage').mockResolvedValue({ok:true,result:{message_id:1}});
    jest.spyOn(svc,'clearMasterOrderCard' as any).mockResolvedValue(undefined);
    return {svc,send,prisma,appSetting,settings};
  }
  it('binds a group once and consumes the code',async()=>{const {svc,appSetting}=setup();await svc.bindOrderGroup(code,{id:-123,type:'supergroup',title:'Orders'},'456');expect(appSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({update:{value:JSON.stringify({chatId:'-123',title:'Orders'})}}));await expect(svc.bindOrderGroup(code,{id:-123,type:'supergroup'},'456')).rejects.toThrow();});
  it('rejects private chats, bad codes and non-admins without consuming code',async()=>{const {svc,appSetting}=setup();await expect(svc.bindOrderGroup(code,{id:456,type:'private'},'456')).rejects.toThrow();await expect(svc.bindOrderGroup('b'.repeat(32),{id:-123,type:'group'},'456')).rejects.toThrow();jest.spyOn(svc,'telegram').mockResolvedValue({ok:true,result:{status:'member'}});await expect(svc.bindOrderGroup(code,{id:-123,type:'group'},'456')).rejects.toThrow();expect(appSetting.deleteMany).not.toHaveBeenCalled();});
  it('rejects expired codes',async()=>{const {svc,appSetting}=setup();appSetting.findUnique.mockResolvedValue({value:JSON.stringify({hash:createHash('sha256').update(code).digest('hex'),expires:0})});await expect(svc.bindOrderGroup(code,{id:-123,type:'group'},'456')).rejects.toThrow();expect(appSetting.deleteMany).not.toHaveBeenCalled();});
  it('sends to group even without a linked master',async()=>{const {svc,send}=setup();const r=await svc.notifyMasterOrder('m','o');expect(send).toHaveBeenCalledTimes(1);expect(send).toHaveBeenCalledWith('-123',expect.stringContaining('Мастер: Master'));expect(r).toMatchObject({ok:false,groupSent:true});});
  it('keeps private delivery independent of failed group delivery',async()=>{const {svc,send}=setup('456');send.mockResolvedValueOnce({ok:false}).mockResolvedValueOnce({ok:true,result:{message_id:2}});const r=await svc.notifyMasterOrder('m','o');expect(r).toMatchObject({ok:true,groupSent:false});expect(send).toHaveBeenLastCalledWith('456',expect.any(String));});
  it('does not send personal or stale assignments',async()=>{const {svc,send,prisma}=setup();prisma.order.findUnique.mockResolvedValue({masterId:'other'});await svc.notifyMasterOrder('m','o');expect(send).not.toHaveBeenCalled();prisma.order.findUnique.mockResolvedValue({masterId:'m',isPersonal:true});await svc.notifyMasterOrder('m','o');expect(send).not.toHaveBeenCalled();});
  it('ignores ordinary group messages',async()=>{const {svc}=setup();const ingest=jest.spyOn(svc,'incomingMessage');await svc.processUpdate({message:{chat:{id:-123,type:'group'},from:{id:456},text:'hello'}});expect(ingest).not.toHaveBeenCalled();});
});
