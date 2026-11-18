const assert=require('node:assert/strict');
const {masterContactVisible}=require('../dist/common/utils/master-contact');
const {BotService}=require('../dist/bot/bot.service');
const {MasterPortalService}=require('../dist/master-portal/master-portal.service');
let marker=null;
let order={id:'o',masterId:'m',publicId:'123',status:'WAITING',isPersonal:false,isServiceCenter:false,client:{name:'Client',phoneNormalized:'79001234567'},master:{user:{fullName:'Master'}},documents:[],address:'Address'};
const bot=Object.create(BotService.prototype);bot.prisma={order:{findUnique:async()=>order,findMany:async()=>[order]},appSetting:{findMany:async()=>marker?[{key:'bot.orders.accepted.o',value:marker}]:[]},master:{findUniqueOrThrow:async()=>({user:{fullName:'Master'}})}};bot.settings={get:async()=>marker};
const portal=Object.create(MasterPortalService.prototype);portal.prisma={appSetting:{findUnique:async()=>marker?{value:marker}:null}};
(async()=>{
 for(const status of ['WAITING','IN_PROGRESS','IN_PROGRESS_SD','DONE']){order.status=status;marker=null;assert.equal((await portal.view(order)).client.phone,null);assert(!(await bot.groupOrderCard('o')).text.includes('79001234567'));assert(!(await bot.masterActiveReport('m')).includes('79001234567'));marker='m';assert.equal((await portal.view(order)).client.phone,'79001234567');assert((await bot.groupOrderCard('o')).text.includes('+79001234567'));assert((await bot.masterActiveReport('m')).includes('+79001234567'));}
 order.masterId='new';assert.equal((await portal.view(order)).client.phone,null);assert(!(await bot.groupOrderCard('o')).text.includes('79001234567'));marker='pending:new';assert.equal((await portal.view(order)).client.phone,null);marker='new';assert.equal((await portal.view(order)).client.phone,'79001234567');
 order.isPersonal=true;marker=null;assert((await bot.groupOrderCard('o')).text.includes('+79001234567'));order.isPersonal=false;order.masterId=null;assert(masterContactVisible(order,null));
 console.log('PASS phone gating: portal, Telegram card/overview before/after acceptance, progressed historical explicit acceptance, reassignment old/pending marker, owner personal');
})().catch(e=>{console.error(e);process.exitCode=1});
