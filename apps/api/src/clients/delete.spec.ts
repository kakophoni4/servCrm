import {ClientsService} from './clients.service';
describe('client deletion',()=>{
 it.each([0,2])('only removes a client without orders (%s)',async count=>{const client={findUnique:jest.fn().mockResolvedValue({_count:{orders:count}}),delete:jest.fn().mockResolvedValue({})};const svc=new ClientsService({$transaction:async(f:any)=>f({client})} as any,{} as any);if(count){await expect(svc.remove('c')).rejects.toThrow('У клиента есть заявки');expect(client.delete).not.toHaveBeenCalled()}else{await expect(svc.remove('c')).resolves.toEqual({deleted:true});expect(client.delete).toHaveBeenCalledWith({where:{id:'c'}})}});
});
