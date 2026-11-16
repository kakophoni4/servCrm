import {createHash} from 'crypto';
import {BotService} from './bot.service';
describe('Telegram master linking',()=>{
 const token='a'.repeat(32);const key='master.bind.master1';
 function setup(expires=Date.now()+10000){
  let value:string|null=JSON.stringify({hash:createHash('sha256').update(token).digest('hex'),expires});
  const update=jest.fn();const tx={appSetting:{findUnique:jest.fn(async()=>value?{value}:null),deleteMany:jest.fn(async()=>{value=null;return {count:1}})},master:{findUnique:jest.fn(async()=>({userId:'u',status:'ACTIVE'}))},user:{findFirst:jest.fn(async()=>null),update}};
  const prisma={$transaction:async(fn:any)=>fn(tx)};
  const svc=new BotService(prisma as any,{} as any,{} as any,{} as any,{} as any,{} as any);return {svc,update,tx};
 }
 it('binds exactly once and rejects reuse',async()=>{const {svc,update,tx}=setup();await svc.bindMaster('m_master1_'+token,'123','123');expect(update).toHaveBeenCalledWith({where:{id:'u'},data:{telegramId:'123'}});expect(tx.appSetting.findUnique).toHaveBeenCalledWith({where:{key}});await expect(svc.bindMaster('m_master1_'+token,'456','456')).rejects.toThrow();});
 it('rejects expired links',async()=>{const {svc,update}=setup(0);await expect(svc.bindMaster('m_master1_'+token,'123','123')).rejects.toThrow();expect(update).not.toHaveBeenCalled()});
 it('rejects invalid tokens and group chats',async()=>{const {svc,update}=setup();await expect(svc.bindMaster('m_master1_'+'b'.repeat(32),'123','123')).rejects.toThrow();await expect(svc.bindMaster('m_master1_'+token,'123','-999')).rejects.toThrow();expect(update).not.toHaveBeenCalled()});
});
