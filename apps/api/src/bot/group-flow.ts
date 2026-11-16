export type GroupFlow = {
  orderId: string; masterId: string | null; telegramId: string; chatId: string;
  messageId: number; kind: 'close' | 'sd'; expires: number; version: string;
  inputMessageId?: number;
  summary?: string;
  docPromptId?: number;
  sdStart?: string; sdFrom?: string; sdDue?: string;
  paid?: number; partsCost?: number; prepay?: number; minDays?: number; maxDays?: number;
  calc?: {workSum:number;masterPct:number;masterSalary:number;toCompany:number;reinvestPct:number;reinvestAmount:number;ownerNet:number};
};
const amount = (text:string) => {
  const value=Number(text.replace(',','.'));
  if(!Number.isFinite(value)||value<0||value>9999999999.99) throw new Error('Некорректная сумма');
  return Math.round(value*100)/100;
};
export function parseClosingReply(text:string) {
  const m=/^(\d+(?:[.,]\d{1,2})?)\s+(\d+(?:[.,]\d{1,2})?)$/.exec(text.trim());
  if(!m)throw new Error('Напишите две суммы через пробел, например: 11000 1000');
  const paid=amount(m[1]),partsCost=amount(m[2]);
  if(paid<=0)throw new Error('Оплата должна быть больше нуля');
  return {paid,partsCost};
}
export function parseSdReply(text:string) {
  const m=/^(\d+(?:[.,]\d{1,2})?)\s*(?:пред(?:оплата)?)?\s+(?:срок\s*)?(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?\s*(?:дней|дня|день|дн\.?)?$/iu.exec(text.trim());
  if(!m)throw new Error('Напишите предоплату и срок, например: 5000 пред, затем с новой строки: Срок 5-7 дней');
  const minDays=Number(m[2]),maxDays=Number(m[3]||m[2]);
  if(minDays<1||maxDays<minDays||maxDays>365)throw new Error('Укажите срок от 1 до 365 дней, меньший срок первым');
  return {prepay:amount(m[1]),minDays,maxDays};
}
export function sdDeadline(days:number, now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value=(key:string)=>Number(parts.find(p=>p.type===key)!.value);
  return new Date(Date.UTC(value('year'),value('month')-1,value('day')+days,20,59,59,999));
}
