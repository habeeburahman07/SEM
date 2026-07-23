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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompetitionsService } from './competitions.service';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { UpdateCompetitionDto } from './dto/update-competition.dto';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { UpdateMatchLineupDto } from './dto/update-match-lineup.dto';
import { RateMatchPlayersDto } from './dto/rate-match-players.dto';

@Controller('workspaces/:workspaceId')
@UseGuards(JwtAuthGuard)
export class CompetitionsController {
  constructor(private readonly competitionsService: CompetitionsService) {}

  // ─── Competitions ────────────────────────────────────────────────────────

  @Get('events/:eventId/competitions')
  getCompetitions(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Request() req: any,
  ) {
    return this.competitionsService.getCompetitions(workspaceId, eventId, req.user.id);
  }

  @Post('events/:eventId/competitions')
  createCompetition(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Body() dto: CreateCompetitionDto,
    @Request() req: any,
  ) {
    return this.competitionsService.createCompetition(workspaceId, eventId, dto, req.user.id);
  }

  @Patch('events/:eventId/competitions/:competitionId')
  updateCompetition(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Body() dto: UpdateCompetitionDto,
    @Request() req: any,
  ) {
    return this.competitionsService.updateCompetition(workspaceId, eventId, competitionId, dto, req.user.id);
  }

  @Delete('events/:eventId/competitions/:competitionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCompetition(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Request() req: any,
  ) {
    return this.competitionsService.removeCompetition(workspaceId, eventId, competitionId, req.user.id);
  }

  // ─── Competition Teams ───────────────────────────────────────────────────

  @Get('events/:eventId/competitions/:competitionId/teams')
  getCompetitionTeams(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Request() req: any,
  ) {
    return this.competitionsService.getCompetitionTeams(workspaceId, eventId, competitionId, req.user.id);
  }

  @Post('events/:eventId/competitions/:competitionId/teams')
  addTeamToCompetition(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Body('teamId') teamId: string,
    @Request() req: any,
  ) {
    return this.competitionsService.addTeamToCompetition(workspaceId, eventId, competitionId, teamId, req.user.id);
  }

  @Delete('events/:eventId/competitions/:competitionId/teams/:teamId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTeamFromCompetition(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Param('teamId') teamId: string,
    @Request() req: any,
  ) {
    return this.competitionsService.removeTeamFromCompetition(workspaceId, eventId, competitionId, teamId, req.user.id);
  }

  // ─── Fixture Generator ──────────────────────────────────────────────────

  @Post('events/:eventId/competitions/:competitionId/generate-fixtures')
  generateFixtures(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Request() req: any,
  ) {
    return this.competitionsService.generateFixtures(workspaceId, eventId, competitionId, req.user.id);
  }

  // ─── Competition Stages ─────────────────────────────────────────────────

  @Get('events/:eventId/competitions/:competitionId/stages')
  getStages(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Request() req: any,
  ) {
    return this.competitionsService.getStages(workspaceId, eventId, competitionId, req.user.id);
  }

  @Post('events/:eventId/competitions/:competitionId/stages')
  createStage(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Body() dto: CreateStageDto,
    @Request() req: any,
  ) {
    return this.competitionsService.createStage(workspaceId, eventId, competitionId, dto, req.user.id);
  }

  @Patch('events/:eventId/competitions/:competitionId/stages/:stageId')
  updateStage(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Param('stageId') stageId: string,
    @Body() dto: UpdateStageDto,
    @Request() req: any,
  ) {
    return this.competitionsService.updateStage(workspaceId, eventId, competitionId, stageId, dto, req.user.id);
  }

  @Delete('events/:eventId/competitions/:competitionId/stages/:stageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeStage(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Param('stageId') stageId: string,
    @Request() req: any,
  ) {
    return this.competitionsService.removeStage(workspaceId, eventId, competitionId, stageId, req.user.id);
  }

  @Delete('events/:eventId/competitions/:competitionId/reset-fixtures')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetStagesAndFixtures(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Request() req: any,
  ) {
    return this.competitionsService.resetStagesAndFixtures(workspaceId, eventId, competitionId, req.user.id);
  }

  // ─── Matches ────────────────────────────────────────────────────────────

  @Get('events/:eventId/competitions/:competitionId/stages/:stageId/matches')
  getMatches(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Param('stageId') stageId: string,
    @Request() req: any,
  ) {
    return this.competitionsService.getMatches(workspaceId, eventId, competitionId, stageId, req.user.id);
  }

  @Post('events/:eventId/competitions/:competitionId/stages/:stageId/matches')
  createMatch(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Param('stageId') stageId: string,
    @Body() dto: CreateMatchDto,
    @Request() req: any,
  ) {
    return this.competitionsService.createMatch(workspaceId, eventId, competitionId, stageId, dto, req.user.id);
  }

  @Patch('events/:eventId/competitions/:competitionId/stages/:stageId/matches/:matchId')
  updateMatch(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Param('stageId') stageId: string,
    @Param('matchId') matchId: string,
    @Body() dto: UpdateMatchDto,
    @Request() req: any,
  ) {
    return this.competitionsService.updateMatch(workspaceId, eventId, competitionId, stageId, matchId, dto, req.user.id);
  }

  @Delete('events/:eventId/competitions/:competitionId/stages/:stageId/matches/:matchId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMatch(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Param('stageId') stageId: string,
    @Param('matchId') matchId: string,
    @Request() req: any,
  ) {
    return this.competitionsService.removeMatch(workspaceId, eventId, competitionId, stageId, matchId, req.user.id);
  }

  // ─── Match Lineup ───────────────────────────────────────────────────────

  @Get('events/:eventId/competitions/:competitionId/stages/:stageId/matches/:matchId/lineup')
  getMatchLineup(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Param('stageId') stageId: string,
    @Param('matchId') matchId: string,
    @Request() req: any,
  ) {
    return this.competitionsService.getMatchLineup(workspaceId, eventId, competitionId, stageId, matchId, req.user.id);
  }

  @Post('events/:eventId/competitions/:competitionId/stages/:stageId/matches/:matchId/lineup')
  saveMatchLineup(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Param('stageId') stageId: string,
    @Param('matchId') matchId: string,
    @Body() dto: UpdateMatchLineupDto,
    @Request() req: any,
  ) {
    return this.competitionsService.saveMatchLineup(workspaceId, eventId, competitionId, stageId, matchId, dto.lineups, req.user.id);
  }

  // ─── Player Ratings ─────────────────────────────────────────────────────

  @Get('events/:eventId/competitions/:competitionId/stages/:stageId/matches/:matchId/ratings')
  getMatchRatings(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Param('stageId') stageId: string,
    @Param('matchId') matchId: string,
    @Request() req: any,
  ) {
    return this.competitionsService.getMatchRatings(workspaceId, eventId, competitionId, stageId, matchId, req.user.id);
  }

  @Post('events/:eventId/competitions/:competitionId/stages/:stageId/matches/:matchId/ratings')
  setMatchPlayerRatings(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Param('stageId') stageId: string,
    @Param('matchId') matchId: string,
    @Body() dto: RateMatchPlayersDto,
    @Request() req: any,
  ) {
    return this.competitionsService.setMatchPlayerRatings(
      workspaceId, eventId, competitionId, stageId, matchId, dto.ratings, req.user.id,
    );
  }

  // ─── Competition Analytics ──────────────────────────────────────────────

  @Get('events/:eventId/competitions/:competitionId/best-player')
  getCompetitionBestPlayer(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Request() req: any,
  ) {
    return this.competitionsService.getCompetitionBestPlayer(workspaceId, eventId, competitionId, req.user.id);
  }

  @Get('events/:eventId/competitions/:competitionId/stats')
  getCompetitionStats(
    @Param('workspaceId') workspaceId: string,
    @Param('eventId') eventId: string,
    @Param('competitionId') competitionId: string,
    @Request() req: any,
  ) {
    return this.competitionsService.getCompetitionStats(workspaceId, eventId, competitionId, req.user.id);
  }
}
