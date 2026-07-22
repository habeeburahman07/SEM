import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from '../workspaces/entities/event.entity';
import { Team } from '../workspaces/entities/team.entity';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, Team]),
    WorkspacesModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
