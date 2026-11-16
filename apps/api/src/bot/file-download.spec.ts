import {BotService} from './bot.service';
describe('Telegram file download',()=>{
 const originalFetch=global.fetch;
 afterEach(()=>{global.fetch=originalFetch;jest.restoreAllMocks()});
 function setup(){
  const bot=new BotService({} as any,{} as any,{getBotToken:async()=> 'test-token'} as any,{} as any,{} as any,{} as any);
  jest.spyOn(bot as any,'sleep').mockResolvedValue(undefined);
  const telegram=jest.spyOn(bot,'telegram');
  const fetchMock=jest.fn();global.fetch=fetchMock as any;
  return {bot,telegram,fetchMock};
 }
 it('retries metadata timeout and download failure, preserving photo bytes',async()=>{
  const {bot,telegram,fetchMock}=setup();
  telegram.mockResolvedValueOnce(null).mockResolvedValueOnce({ok:true,result:{file_path:'photos/file.jpg'}});
  fetchMock.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ok:true,arrayBuffer:async()=>Buffer.from('photo-data')});
  const result=await (bot as any).downloadTgFile({photo:[{file_id:'small'},{file_id:'large'}]});
  expect(telegram).toHaveBeenCalledTimes(2);expect(telegram).toHaveBeenLastCalledWith('getFile',{file_id:'large'});
  expect(fetchMock).toHaveBeenCalledTimes(2);expect(result.buffer.toString()).toBe('photo-data');expect(result.originalname).toBe('photo.jpg');
 });
 it('does not retry a permanent API error or download without a file path',async()=>{
  const {bot,telegram,fetchMock}=setup();telegram.mockResolvedValue({ok:false,error_code:400,description:'Bad Request: invalid file_id'});
  await expect((bot as any).downloadTgFile({document:{file_id:'bad',file_name:'act.pdf'}})).rejects.toThrow('Telegram не отдал файл');
  expect(telegram).toHaveBeenCalledTimes(1);expect(fetchMock).not.toHaveBeenCalled();
 });
 it('bounds retries and leaves a clear retry instruction',async()=>{
  const {bot,telegram,fetchMock}=setup();telegram.mockResolvedValue(null);
  await expect((bot as any).downloadTgFile({photo:[{file_id:'photo'}]})).rejects.toThrow('Telegram временно не отдаёт файл');
  expect(telegram).toHaveBeenCalledTimes(3);expect(fetchMock).not.toHaveBeenCalled();
 });
});
