'use client';
export const TECH = [['ХД','Холодильник'],['СМ','Стиральная машина'],['ПММ','Посудомоечная машина'],['ТВ','Телевизор'],['ПК','Компьютер'],['Другое','Другое']] as const;
export function TechPicker({value,onChange}:{value:string;onChange:(v:string)=>void}){return <div className="tech-picker">{TECH.map(([code,label])=><button key={code} type="button" title={label} aria-pressed={value===code} className={value===code?'btn':'btn secondary'} onClick={()=>onChange(code)}>{code}</button>)}{value&&!TECH.some(([code])=>code===value)&&<span>{value}</span>}</div>}
