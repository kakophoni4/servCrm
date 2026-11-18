import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AvitoUnreadProvider,useAvitoUnread,newMessages} from './Unread';
import {api,getStoredUser} from '@/lib/api';
vi.mock('@/lib/api',()=>({api:vi.fn(),getStoredUser:vi.fn()}));
beforeEach(()=>{sessionStorage.clear();localStorage.clear()});
function Badge(){const u=useAvitoUnread();return <><span data-testid="badge">{u.ids.length}</span><button onClick={()=>void u.read('one')}>Read</button><button onClick={u.refresh}>Refresh</button></>}
afterEach(()=>{cleanup();vi.clearAllMocks()});
it('polling only reads counters; a successful explicit read removes that chat',async()=>{
 vi.mocked(getStoredUser).mockReturnValue({role:'OWNER'} as ReturnType<typeof getStoredUser>);
 vi.mocked(api).mockImplementation(async(path)=>path==='/avito/unread'?{ids:['one','two'],hasMore:false}:{ok:true});
 render(<AvitoUnreadProvider><Badge/></AvitoUnreadProvider>);
 await waitFor(()=>expect(screen.getByTestId('badge').textContent).toBe('2'));
 expect(vi.mocked(api).mock.calls.every(([path])=>path==='/avito/unread')).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Read'}));
 await waitFor(()=>expect(screen.getByTestId('badge').textContent).toBe('1'));
 expect(api).toHaveBeenCalledWith('/avito/chats/one/read',{method:'POST'});
});
it('does not access Avito for staff',()=>{
 vi.mocked(getStoredUser).mockReturnValue({role:'ADMIN'} as ReturnType<typeof getStoredUser>);
 render(<AvitoUnreadProvider><Badge/></AvitoUnreadProvider>);expect(api).not.toHaveBeenCalled();
});

it('notifies only for a new incoming message, including another message in the same unread chat',()=>{
 const entry={id:'one',messageId:'m2',created:200,name:'Client',incoming:true};
 expect(newMessages(null,[entry],100)).toEqual([]);
 expect(newMessages({one:'m1'},[entry],100)).toEqual([entry]);
 expect(newMessages({one:'m2'},[entry],100)).toEqual([]);
 expect(newMessages({},[{...entry,incoming:false}],100)).toEqual([]);
 expect(newMessages({},[{...entry,created:90}],100)).toEqual([]);
});

it('shows a toast for a later incoming message, without announcing old unread chats',async()=>{
 vi.mocked(getStoredUser).mockReturnValue({role:'OWNER'} as ReturnType<typeof getStoredUser>);
 let messageId='first';
 vi.mocked(api).mockImplementation(async()=>({ids:['one'],hasMore:false,entries:[{id:'one',messageId,created:Math.floor(Date.now()/1000),name:'Test sender',incoming:true}]}));
 render(<AvitoUnreadProvider><Badge/></AvitoUnreadProvider>);
 await waitFor(()=>expect(screen.getByTestId('badge').textContent).toBe('1'));
 expect(screen.queryByText('Новое сообщение в Авито')).toBeNull();
 messageId='second';fireEvent.click(screen.getByRole('button',{name:'Refresh'}));
 expect(await screen.findByText('Новое сообщение в Авито')).toBeTruthy();
 expect(screen.getByRole('link').getAttribute('href')).toBe('/avito?chat=one');
});
