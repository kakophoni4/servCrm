import {BadRequestException,Body,Controller,Delete,ForbiddenException,Param,UseGuards} from '@nestjs/common';
import {IsString} from 'class-validator';
import {Role,Prisma} from '@prisma/client';
import {CurrentUser} from '../common/decorators/current-user.decorator';
import {Roles} from '../common/decorators/roles.decorator';
import {JwtAuthGuard} from '../common/guards/jwt-auth.guard';
import {RolesGuard} from '../common/guards/roles.guard';
import {PrismaService} from '../prisma/prisma.service';
import {StorageService} from '../common/storage/storage.service';
import {BotService} from '../bot/bot.service';
import {SettlementsService} from '../settlements/settlements.service';
class DeleteOrderDto { @IsString() confirmation!:string; }
@Controller('orders')
@UseGuards(JwtAuthGuard,RolesGuard)
export class OrderDeletionController {
 constructor(private readonly prisma:PrismaService,private readonly storage:StorageService,private readonly bot:BotService,private readonly settlements:SettlementsService){}
 @Delete(':id') @Roles(Role.OWNER)
 async remove(@Param('id') id:string,@Body() dto:DeleteOrderDto,@CurrentUser() actor:{userId:string;role:Role}) {
  const owner=await this.prisma.user.findUnique({where:{id:actor.userId},select:{role:true,status:true}});
  if(actor.role!==Role.OWNER||owner?.role!==Role.OWNER||owner.status!=='ACTIVE')throw new ForbiddenException('Удалять заявки может только владелец');
  const removed=await this.prisma.$transaction(async tx=>{
   const order=await tx.order.findUnique({where:{id},include:{documents:true}});
   if(!order)throw new BadRequestException('Заявка уже удалена или не найдена');
   if(dto.confirmation?.trim()!==order.publicId)throw new BadRequestException('Введите номер заявки для подтверждения');
   const records=await tx.appSetting.findMany({where:{key:{startsWith:'bot.'}}});
   const references=records.filter(r=>{try{return JSON.parse(r.value)?.orderId===id}catch{return r.key==='bot.orders.accepted.'+id}});
   const tokens=new Set(references.map(r=>r.key.split('.').slice(-1)[0]));
   const extra=records.filter(r=>{try{const v=JSON.parse(r.value);return v.token&&tokens.has(v.token)}catch{return false}});
   const cards=references.flatMap(r=>{try{const v=JSON.parse(r.value);return v.chatId&&v.messageId?[{chatId:String(v.chatId),messageId:Number(v.messageId)}]:[]}catch{return []}});
   if(order.masterTgChatId&&order.masterTgMessageId)cards.push({chatId:order.masterTgChatId,messageId:order.masterTgMessageId});
   await tx.appSetting.deleteMany({where:{key:{in:[...references,...extra].map(r=>r.key)}}});
   await tx.chatThread.updateMany({where:{linkedOrderId:id},data:{linkedOrderId:null}});
   await tx.cashTx.deleteMany({where:{orderId:id}});
   await tx.order.delete({where:{id}});
   await tx.appSetting.create({data:{key:'order.deleted.'+id,value:JSON.stringify({publicId:order.publicId,by:actor.userId,at:new Date().toISOString()})}});
   return {order,cards};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  let cleanupPending=0;
  for(const doc of removed.order.documents){try{this.storage.remove(doc.filePath)}catch{cleanupPending++}}
  if(removed.order.masterId&&removed.order.completedAt)await this.settlements.syncMasterMonth(removed.order.masterId,removed.order.completedAt,removed.order.cityId).catch(()=>{cleanupPending++});
  const unique=new Map(removed.cards.map(c=>[c.chatId+':'+c.messageId,c]));
  for(const card of unique.values()){
   const r=await this.bot.telegram<{ok:boolean;description?:string}>('editMessageText',{chat_id:card.chatId,message_id:card.messageId,text:'Заявка '+removed.order.publicId+' удалена владельцем.',reply_markup:{inline_keyboard:[]}}).catch(()=>null);
   if(!r?.ok&&!r?.description?.includes('message is not modified'))cleanupPending++;
  }
  return {deleted:true,cleanupPending};
 }
}
