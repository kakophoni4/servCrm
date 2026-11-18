export function groupParts<T extends {category:string;name:string}>(parts:T[]) {
 const groups=new Map<string,{name:string;parts:T[]}>();
 for(const part of parts){const name=part.category?.trim()||'Без группы';const key=name.toLocaleLowerCase('ru');const group=groups.get(key)||{name,parts:[]};group.parts.push(part);groups.set(key,group)}
 return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru')).map(group=>({...group,parts:group.parts.sort((a,b)=>a.name.localeCompare(b.name,'ru',{numeric:true}))}));
}
