import {describe,it,expect} from 'vitest';
import {orderDateInput,orderDateIso,orderDay,isScheduledToday} from './order-date';
describe('Samara order time',()=>{
 it('preserves chosen 10:00 independent of device zone',()=>{expect(orderDateIso('2026-11-19T10:00')).toBe('2026-11-19T06:00:00.000Z');expect(orderDateInput('2026-11-19T06:00:00Z')).toBe('2026-11-19T10:00')});
 it('uses local midnight for today and quick picks',()=>{const now=new Date('2026-11-18T20:30:00Z');expect(orderDay(0,now)).toBe('2026-11-19');expect(orderDay(1,now)).toBe('2026-11-20');expect(isScheduledToday('2026-11-18T20:00:00Z',+now)).toBe(true);expect(isScheduledToday('2026-11-18T19:59:59Z',+now)).toBe(false)});
 it('rejects invalid calendar dates',()=>{expect(()=>orderDateIso('2026-02-30T10:00')).toThrow();expect(()=>orderDateIso('')).toThrow()});
});
