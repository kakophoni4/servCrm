const assert=require('node:assert/strict');
const {PrismaClient,Prisma}=require('@prisma/client');
const {StaffController}=require('../dist/users/staff.controller');
const {AuthService}=require('../dist/auth/auth.service');
const {JwtStrategy}=require('../dist/auth/jwt.strategy');
const {assertStaffAccess,redactStaffMoney,redactStaffSecrets,StaffAccessInterceptor}=require('../dist/common/staff-access.interceptor');
const {of,lastValueFrom}=require('rxjs');
assert(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));
const p=new PrismaClient(),ids=[];
(async()=>{try{
 const staff=new StaffController(p),auth=new AuthService(p,{signAsync:async p=>p});const strategy=new JwtStrategy({get:()=> 'test-secret'},p);
 for(const profile of ['logistic','assistant']){
 const user=await staff.create({login:'staffcheck'+Date.now()+profile,fullName:'Test '+profile,password:'Test-only-123!',profile});ids.push(user.id);
 const login=await auth.login({login:user.login,password:'Test-only-123!'});assert(login.user.permissions.includes('staff.'+profile));
 const actor=await strategy.validate({sub:user.id,login:user.login,role:'OWNER'});assert.equal(actor.role,'ADMIN');
 for(const path of ['/staff','/settings/bot','/salary-categories','/settlements/cash','/reports','/users'])assert.throws(()=>assertStaffAccess(profile,'GET',path,{}));
 assert.throws(()=>assertStaffAccess(profile,'DELETE','/orders/123',{}));
 assertStaffAccess(profile,'PATCH','/orders/123',{masterId:'m',scheduledAt:new Date().toISOString()});
 if(profile==='logistic'){assert.throws(()=>assertStaffAccess(profile,'PATCH','/orders/123',{paid:1}));assert.throws(()=>assertStaffAccess(profile,'PATCH','/orders/123',{status:'DONE'}));assert.throws(()=>assertStaffAccess(profile,'GET','/orders/123/documents',{}));}else{assertStaffAccess(profile,'PATCH','/orders/123',{paid:1,status:'DONE'});assertStaffAccess(profile,'GET','/orders/123/documents',{});}
 const source={id:'o',payment:{paid:new Prisma.Decimal(100)},master:{user:{passwordHash:'secret',passportEnc:'secret',fullName:'Name'}},documents:[{filePath:'secret'}],claims:[{refundSum:50}]};
 const interceptor=new StaffAccessInterceptor(p);const response=await interceptor.intercept({switchToHttp:()=>({getRequest:()=>({user:actor,path:'/orders/123',method:'GET'})})},{handle:()=>of(source)});const result=await lastValueFrom(response);assert(!JSON.stringify(result).includes('secret'));if(profile==='logistic'){assert(!result.payment);assert(!result.claims);assert(!result.documents)}else assert.equal(result.payment.paid,'100');
 await staff.active(user.id,{active:false});await assert.rejects(()=>auth.login({login:user.login,password:'Test-only-123!'}));await assert.rejects(()=>strategy.validate({sub:user.id,login:user.login,role:'ADMIN'}));
 await staff.active(user.id,{active:true});await staff.password(user.id,{password:'Test-new-456!'});await assert.rejects(()=>auth.login({login:user.login,password:'Test-only-123!'}));await auth.login({login:user.login,password:'Test-new-456!'});
 }
 console.log('PASS staff create/login, two profiles, server route and payment boundaries, nested credentials redaction, financial redaction, inactive session rejection, password reset');
}finally{await p.user.deleteMany({where:{id:{in:ids}}});await p.$disconnect()}})().catch(e=>{console.error(e);process.exitCode=1});
