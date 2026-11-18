import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {MessageContent,mediaUrl,messageText} from './MessageContent';
import {api} from '@/lib/api';
vi.mock('@/lib/api',()=>({api:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks()});
it('renders the largest Avito photo, but rejects untrusted media hosts',()=>{
 render(<MessageContent message={{id:'p',created:1,type:'image',content:{image:{sizes:{'32x32':'https://00.img.avito.st/small','640x480':'https://00.img.avito.st/large','1920x1080':'https://evil.test/track'}}}}}/>);
 expect(screen.getByRole('img').getAttribute('src')).toBe('https://00.img.avito.st/large');
 expect(mediaUrl('javascript:alert(1)')).toBeNull();expect(mediaUrl('https://avito.ru.evil.test/a')).toBeNull();
 fireEvent.error(screen.getByRole('img'));expect(screen.getByText('Фото недоступно')).toBeTruthy();
});
it('shows system text and app calls rather than a generic attachment',()=>{
 expect(messageText({id:'s',created:1,type:'system',content:{text:'Системное сообщение'}})).toBe('Системное сообщение');
 expect(messageText({id:'c',created:1,type:'appCall',content:{}})).toBe('Звонок через Авито');
});
it('loads an expiring voice URL only when requested',async()=>{
 vi.mocked(api).mockResolvedValue({url:'https://files.avito.ru/voice.mp4'});
 const {container}=render(<MessageContent message={{id:'v',created:1,type:'voice',content:{voice:{voice_id:'voice-id'}}}}/>);
 expect(api).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Загрузить голосовое'}));
 await screen.findByRole('link',{name:'Открыть запись'});
 expect(api).toHaveBeenCalledWith('/avito/voices/voice-id');expect(container.querySelector('audio')?.src).toBe('https://files.avito.ru/voice.mp4');
});
