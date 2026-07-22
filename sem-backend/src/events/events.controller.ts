import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('workspaces/:workspaceId/events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  getEvents(@Param('workspaceId') workspaceId: string, @Request() req: any) {
    return this.eventsService.getEvents(workspaceId, req.user.id);
  }

  @Post()
  createEvent(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateEventDto,
    @Request() req: any,
  ) {
    return this.eventsService.createEvent(workspaceId, dto, req.user.id);
  }

  @Patch(':eventId')
  updateEvent(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventDto,
    @Request() req: any,
  ) {
    return this.eventsService.updateEvent(workspaceId, eventId, dto, req.user.id);
  }

  @Delete(':eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeEvent(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Request() req: any,
  ) {
    return this.eventsService.removeEvent(workspaceId, eventId, req.user.id);
  }

  @Get(':eventId/standings')
  getEventStandings(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Request() req: any,
  ) {
    return this.eventsService.getEventStandings(workspaceId, eventId, req.user.id);
  }
}
