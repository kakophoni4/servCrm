import {BotService} from './bot.service';
describe('Assignment notices',()=>{
  function setup(group:string|null){
    const prisma={master:{findUnique:jest.fn().mockResolvedValue({user:{telegramId:'private'}})}};
    const service=new BotService(prisma as any,{} as any,{} as any,{} as any,{} as any,{} as any);
    jest.spyOn(service as any,'getMasterGroup').mockResolvedValue(group?{chatId:group}:null);
    const send=jest.spyOn(service,'sendMessage').mockResolvedValue({ok:true} as any);
    const clear=jest.spyOn(service,'clearMasterOrderCard').mockResolvedValue(undefined);
    return {service,send,clear};
  }
  it('notifies the old master group with number and address',async()=>{
    const {service,send,clear}=setup('old-group');
    await service.notifyMasterOrderRevoked('old-master','123','Улица 1','order');
    expect(clear).toHaveBeenCalledWith('order');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('old-group','Заявка снята · 123\nАдрес: Улица 1');
  });
  it('falls back to personal Telegram when no group is connected',async()=>{
    const {service,send}=setup(null);
    await service.notifyMasterOrderNotice('m','123','Улица 1','Заявка отменена');
    expect(send).toHaveBeenCalledWith('private','Заявка отменена · 123\nАдрес: Улица 1');
  });
});
