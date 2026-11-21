export type GroupFlow = {
  orderId: string; masterId: string | null; telegramId: string; chatId: string;
  messageId: number; kind: 'close' | 'sd'; expires: number; version: string;
  inputMessageId?: number;
  documentsOnly?: boolean;
  summary?: string;
  docPromptId?: number;
  warrantyMonths?: number; sdComment?:string;
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
  const lines=text.trim().split(/\r?\n/);
  const m=/^(\d+(?:[.,]\d{1,2})?)\s+(\d+(?:[.,]\d{1,2})?)$/.exec(lines[0].trim());
  const warrantyMonths=lines.length>1?Number(lines[1].trim()):undefined;
  if(lines.length>2 || (warrantyMonths!==undefined&&(!Number.isInteger(warrantyMonths)||warrantyMonths<0||warrantyMonths>120||!lines[1].trim())))throw new Error('Во второй строке укажите гарантию в месяцах: 0, 3, 6 или 12');
  if(!m)throw new Error('Напишите две суммы через пробел, например: 11000 1000');
  const paid=amount(m[1]),partsCost=amount(m[2]);

  return {paid,partsCost,...(warrantyMonths!==undefined?{warrantyMonths}:{})};
}
export function parseSdReply(text:string) {
  const lines=text.trim().split(/\r?\n/);
  const sdComment=lines.slice(2).join("\n").trim();
  if(sdComment.length>1000)throw new Error("Комментарий - до 1000 символов");
  text=lines.slice(0,2).join("\n");
  const m=/^(\d+(?:[.,]\d{1,2})?)\s*(?:пред(?:оплата)?)?\s+(?:срок\s*)?(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?\s*(?:дней|дня|день|дн\.?)?$/iu.exec(text.trim());
  if(!m)throw new Error('Напишите предоплату и срок, например: 5000 пред, затем с новой строки: Срок 5-7 дней');
  const minDays=Number(m[2]),maxDays=Number(m[3]||m[2]);
  if(minDays<1||maxDays<minDays||maxDays>365)throw new Error('Укажите срок от 1 до 365 дней, меньший срок первым');
  return {prepay:amount(m[1]),minDays,maxDays,...(sdComment?{sdComment}:{})};
}
export function sdDeadline(days:number, now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Samara',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value=(key:string)=>Number(parts.find(p=>p.type===key)!.value);
  return new Date(Date.UTC(value('year'),value('month')-1,value('day')+days,19,59,59,999));
}
