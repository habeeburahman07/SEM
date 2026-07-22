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
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('workspaces/:workspaceId/teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  getTeams(@Param('workspaceId') workspaceId: string, @Request() req: any) {
    return this.teamsService.getTeams(workspaceId, req.user.id);
  }

  @Post()
  createTeam(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateTeamDto,
    @Request() req: any,
  ) {
    return this.teamsService.createTeam(workspaceId, dto, req.user.id);
  }

  @Patch(':teamId')
  updateTeam(
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamDto,
    @Request() req: any,
  ) {
    return this.teamsService.updateTeam(workspaceId, teamId, dto, req.user.id);
  }

  @Delete(':teamId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTeam(
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Request() req: any,
  ) {
    return this.teamsService.removeTeam(workspaceId, teamId, req.user.id);
  }

  @Get(':teamId/stats')
  getTeamStats(
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Request() req: any,
  ) {
    return this.teamsService.getTeamStats(workspaceId, teamId, req.user.id);
  }
}
