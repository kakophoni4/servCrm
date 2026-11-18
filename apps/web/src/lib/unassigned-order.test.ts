import {expect,it} from 'vitest';
import {isOverdueUnassigned} from './unassigned-order';
const now=Date.parse('2026-11-18T12:00:00Z');
const order={status:'WAITING',createdAt:'2026-11-18T11:55:00Z'};
it('alerts at five minutes from creation, even with no visit date',()=>{expect(isOverdueUnassigned(order,now-1)).toBe(false);expect(isOverdueUnassigned(order,now)).toBe(true);expect(isOverdueUnassigned({...order,createdAt:'bad'},now)).toBe(false)});
it('does not alert assigned, owner-operated or finished orders',()=>{for(const change of [{master:{}},{masterId:'m'},{isPersonal:true},{isServiceCenter:true},{status:'DONE'},{status:'REFUSAL'},{status:'CANCELLED_CC'}])expect(isOverdueUnassigned({...order,...change},now)).toBe(false)});
