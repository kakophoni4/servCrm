require('reflect-metadata');
const assert=require('node:assert/strict');
const {AvitoStatsService,validatePeriod,metric}=require('../dist/avito/avito-stats.service');
(async()=>{
 for(const dates of [['2026-02-30','2026-03-01'],['2026-11-18','2026-11-01'],['2026-01-01','2026-11-18'],['x','2026-01-01']])assert.throws(()=>validatePeriod(...dates));
 validatePeriod('2024-02-29','2024-02-29');
 assert.equal(metric({metrics:[]},'views'),null);assert.equal(metric({metrics:[{slug:'views',value:0}]},'views'),0);
 let requests=0;
 const fake={profile:async()=>({id:123}),request:async(path,body)=>{
  requests++;
  if(path.startsWith('/core/'))return {resources:[{id:1,title:'Repair'}]};
  assert.equal(body.grouping,'item');assert.deepEqual(body.metrics,['views','contacts','spending']);
  return {result:{dataTotalCount:2,timestamp:'1795001547',groupings:body.offset===0?[{id:1,type:'items',metrics:[{slug:'views',value:295},{slug:'contacts',value:53},{slug:'spending',value:2604824}]}]:[{id:2,type:'items',metrics:[{slug:'views',value:0}]}]}};
 }};
 const svc=new AvitoStatsService(fake),[a,b]=await Promise.all([svc.stats('2026-11-01','2026-11-18'),svc.stats('2026-11-01','2026-11-18')]);
 assert.equal(a,b);assert.equal(requests,3);assert.equal(a.items[0].spendingRub,26048.24);assert.equal(a.items[1].views,0);assert.equal(a.items[1].contacts,null);assert.equal(a.items[1].spendingRub,null);
 await svc.stats('2026-11-01','2026-11-18');assert.equal(requests,3);
 fake.request=async()=>({result:{dataTotalCount:2,groupings:[]}});
 await assert.rejects(()=>svc.stats('2026-11-02','2026-11-18'),/неполную статистику/);
 console.log('PASS Avito stats: dates, pagination, concurrent cache, kopecks, missing vs zero, incomplete response rejection');
})().catch(e=>{console.error(e);process.exitCode=1});
