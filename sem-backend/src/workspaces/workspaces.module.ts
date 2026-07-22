import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMember } from './entities/workspace-member.entity';
import { Role } from './entities/role.entity';
import { Team } from './entities/team.entity';
import { Player } from './entities/player.entity';
import { Event } from './entities/event.entity';
import { Sport } from './entities/sport.entity';
import { Competition } from './entities/competition.entity';
import { CompetitionStage } from './entities/competition-stage.entity';
import { Match } from './entities/match.entity';
import { CompetitionTeam } from './entities/competition-team.entity';
import { Permission } from './entities/permission.entity';
import { Venue } from './entities/venue.entity';
import { Notification } from './entities/notification.entity';
import { MatchPlayer } from './entities/match-player.entity';
import { AuditLog } from './entities/audit-log.entity';
import { SystemConfig } from './entities/system-config.entity';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesController } from './workspaces.controller';
import { SystemSettingsController } from './system-settings.controller';
import { UsersModule } from '../users/users.module';
import { EventsGateway } from './events.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Workspace,
      WorkspaceMember,
      Role,
      Team,
      Player,
      Event,
      Sport,
      Competition,
      CompetitionStage,
      Match,
      CompetitionTeam,
      Permission,
      Venue,
      Notification,
      MatchPlayer,
      AuditLog,
      SystemConfig,
    ]),
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'super-secret-key-12345'),
        signOptions: {
          expiresIn: configService.get<any>('JWT_EXPIRATION', '24h'),
        },
      }),
    }),
  ],
  controllers: [WorkspacesController, SystemSettingsController],
  providers: [WorkspacesService, EventsGateway],
  exports: [WorkspacesService, EventsGateway],
})
export class WorkspacesModule {}
