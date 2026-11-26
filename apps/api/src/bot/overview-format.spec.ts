import {deadlineLine,overviewChunks} from './overview-format';

it('keeps a deadline orange through midnight in Samara',()=>{
  const due=new Date('2026-11-26T01:00:00Z');
  expect(deadlineLine(due,new Date('2026-11-26T19:59:59Z'))).toContain('🟠');
  expect(deadlineLine(due,new Date('2026-11-26T20:00:00Z'))).toContain('🔴');
});
it('preserves long plain text, literal markup, emoji and label offsets',()=>{
  const text='Актуальные заявки\nЗаявка 55\nОписание: <b>пример</b>'+'😀'.repeat(4000)+'\n🟠 Срок СД: 26.11.2026';
  const chunks=overviewChunks(text,true);
  expect(chunks.map(c=>c.text).join('')).toBe(text);
  for(const c of chunks){expect(c.text.length).toBeLessThanOrEqual(3500);expect(c.text).not.toMatch(/[\uD800-\uDBFF]$/);}
  expect(chunks.flatMap(c=>c.entities.map(e=>c.text.slice(e.offset,e.offset+e.length)))).toEqual(['Актуальные заявки','Заявка 55','Описание:','🟠 Срок СД:']);
});
