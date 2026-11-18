import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {AvitoUnreadProvider,useAvitoUnread} from './Unread';
import {api,getStoredUser} from '@/lib/api';
vi.mock('@/lib/api',()=>({api:vi.fn(),getStoredUser:vi.fn()}));
function Badge(){const u=useAvitoUnread();return <><span data-testid="badge">{u.ids.length}</span><button onClick={()=>void u.read('one')}>Read</button></>}
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
