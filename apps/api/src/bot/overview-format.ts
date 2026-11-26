const localDate = new Intl.DateTimeFormat('ru-RU', {timeZone: 'Europe/Samara'});
export function deadlineLine(due: Date | null, now = new Date()) {
  if (!due) return '🟠 Срок СД: не указан';
  const samaraDay = (date: Date) => Math.floor((date.getTime() + 4 * 3600000) / 86400000);
  const overdue = samaraDay(due) < samaraDay(now);
  return (overdue ? '🔴' : '🟠') + ' Срок СД: ' + localDate.format(due) + (overdue ? ' · просрочено' : '');
}

export function overviewChunks(text: string, bold: boolean) {
  const pattern = /^(?:Актуальные заявки[^\n]*|(?:Назначены и в работе|СД|Гарантии|Личные|СЦ) · \d+|Заявка \S+|(?:Всего|Клиент|Телефон|Адрес|Время|Техника|Статус|Описание):|(?:🔴|🟠) Срок СД:)/gm;
  const spans = bold ? Array.from(text.matchAll(pattern), m=>({start:m.index!, end:m.index!+m[0].length})) : [];
  const chunks = [];
  let firstSpan = 0;
  for(let start=0; start<text.length;) {
    let end=Math.min(start+3500,text.length);
    if(spans[firstSpan+100])end=Math.min(end,spans[firstSpan+100].start);
    if(end<text.length){
      const newline=text.lastIndexOf('\n',end-1);
      if(newline>start)end=newline+1;
      else if(/[\uD800-\uDBFF]/.test(text[end-1]))end--;
    }
    const entities=[];
    for(let i=firstSpan; i<spans.length && spans[i].start<end; i++){
      const span=spans[i], offset=Math.max(span.start,start);
      entities.push({type:'bold',offset:offset-start,length:Math.min(span.end,end)-offset});
      if(span.end<=end)firstSpan=i+1;
    }
    chunks.push({text:text.slice(start,end),entities});
    start=end;
  }
  return chunks;
}
