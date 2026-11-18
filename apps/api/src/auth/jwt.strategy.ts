import { PrismaService } from '../prisma/prisma.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

type JwtPayload = {
  sub: string;
  login: string;
  role: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma:PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'dev-change-me'),
    });
  }

  async validate(payload: JwtPayload) {
    const user=await this.prisma.user.findUnique({where:{id:payload.sub},select:{status:true,role:true,permissions:true,masterWebEnabled:true}});
    if(!user||user.status!=='ACTIVE'||(user.role==='MASTER'&&!user.masterWebEnabled))throw new UnauthorizedException();
    return {
      userId: payload.sub,
      login: payload.login,
      role: user.role,
      permissions:user.permissions,
    };
  }
}
