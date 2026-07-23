import { Injectable } from '@nestjs/common';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { UpdateCompetitionDto } from './dto/update-competition.dto';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { MatchPlayerLineupItemDto } from './dto/update-match-lineup.dto';
import { RateMatchPlayerItemDto } from './dto/rate-match-players.dto';

@Injectable()
export class CompetitionsService {
  constructor(private readonly workspacesService: WorkspacesService) {}

  // ─── Competitions ────────────────────────────────────────────────────────

  getCompetitions(workspaceId: string, eventId: string, userId: string) {
    return this.workspacesService.getCompetitions(workspaceId, eventId, userId);
  }

  createCompetition(workspaceId: string, eventId: string, dto: CreateCompetitionDto, userId: string) {
    return this.workspacesService.createCompetition(workspaceId, eventId, dto, userId);
  }

  updateCompetition(workspaceId: string, eventId: string, competitionId: string, dto: UpdateCompetitionDto, userId: string) {
    return this.workspacesService.updateCompetition(workspaceId, eventId, competitionId, dto, userId);
  }

  removeCompetition(workspaceId: string, eventId: string, competitionId: string, userId: string) {
    return this.workspacesService.removeCompetition(workspaceId, eventId, competitionId, userId);
  }

  // ─── Competition Teams ───────────────────────────────────────────────────

  getCompetitionTeams(workspaceId: string, eventId: string, competitionId: string, userId: string) {
    return this.workspacesService.getCompetitionTeams(workspaceId, eventId, competitionId, userId);
  }

  addTeamToCompetition(workspaceId: string, eventId: string, competitionId: string, teamId: string, userId: string) {
    return this.workspacesService.addTeamToCompetition(workspaceId, eventId, competitionId, teamId, userId);
  }

  removeTeamFromCompetition(workspaceId: string, eventId: string, competitionId: string, teamId: string, userId: string) {
    return this.workspacesService.removeTeamFromCompetition(workspaceId, eventId, competitionId, teamId, userId);
  }

  // ─── Fixture Generator ──────────────────────────────────────────────────

  generateFixtures(workspaceId: string, eventId: string, competitionId: string, userId: string) {
    return this.workspacesService.generateFixtures(workspaceId, eventId, competitionId, userId);
  }

  // ─── Competition Stages ─────────────────────────────────────────────────

  getStages(workspaceId: string, eventId: string, competitionId: string, userId: string) {
    return this.workspacesService.getStages(workspaceId, eventId, competitionId, userId);
  }

  createStage(workspaceId: string, eventId: string, competitionId: string, dto: CreateStageDto, userId: string) {
    return this.workspacesService.createStage(workspaceId, eventId, competitionId, dto, userId);
  }

  updateStage(workspaceId: string, eventId: string, competitionId: string, stageId: string, dto: UpdateStageDto, userId: string) {
    return this.workspacesService.updateStage(workspaceId, eventId, competitionId, stageId, dto, userId);
  }

  removeStage(workspaceId: string, eventId: string, competitionId: string, stageId: string, userId: string) {
    return this.workspacesService.removeStage(workspaceId, eventId, competitionId, stageId, userId);
  }

  resetStagesAndFixtures(workspaceId: string, eventId: string, competitionId: string, userId: string) {
    return this.workspacesService.resetStagesAndFixtures(workspaceId, eventId, competitionId, userId);
  }

  // ─── Matches ────────────────────────────────────────────────────────────

  getMatches(workspaceId: string, eventId: string, competitionId: string, stageId: string, userId: string) {
    return this.workspacesService.getMatches(workspaceId, eventId, competitionId, stageId, userId);
  }

  createMatch(workspaceId: string, eventId: string, competitionId: string, stageId: string, dto: CreateMatchDto, userId: string) {
    return this.workspacesService.createMatch(workspaceId, eventId, competitionId, stageId, dto, userId);
  }

  updateMatch(workspaceId: string, eventId: string, competitionId: string, stageId: string, matchId: string, dto: UpdateMatchDto, userId: string) {
    return this.workspacesService.updateMatch(workspaceId, eventId, competitionId, stageId, matchId, dto, userId);
  }

  removeMatch(workspaceId: string, eventId: string, competitionId: string, stageId: string, matchId: string, userId: string) {
    return this.workspacesService.removeMatch(workspaceId, eventId, competitionId, stageId, matchId, userId);
  }

  // ─── Match Lineup ───────────────────────────────────────────────────────

  getMatchLineup(workspaceId: string, eventId: string, competitionId: string, stageId: string, matchId: string, userId: string) {
    return this.workspacesService.getMatchLineup(workspaceId, eventId, competitionId, stageId, matchId, userId);
  }

  saveMatchLineup(workspaceId: string, eventId: string, competitionId: string, stageId: string, matchId: string, lineups: MatchPlayerLineupItemDto[], userId: string) {
    return this.workspacesService.saveMatchLineup(workspaceId, eventId, competitionId, stageId, matchId, lineups, userId);
  }

  // ─── Player Ratings ─────────────────────────────────────────────────────

  getMatchRatings(workspaceId: string, eventId: string, competitionId: string, stageId: string, matchId: string, userId: string) {
    return this.workspacesService.getMatchRatings(workspaceId, eventId, competitionId, stageId, matchId, userId);
  }

  setMatchPlayerRatings(workspaceId: string, eventId: string, competitionId: string, stageId: string, matchId: string, ratings: RateMatchPlayerItemDto[], userId: string) {
    return this.workspacesService.setMatchPlayerRatings(workspaceId, eventId, competitionId, stageId, matchId, ratings, userId);
  }

  // ─── Competition Analytics ──────────────────────────────────────────────

  getCompetitionBestPlayer(workspaceId: string, eventId: string, competitionId: string, userId: string) {
    return this.workspacesService.getCompetitionBestPlayer(workspaceId, eventId, competitionId, userId);
  }

  getCompetitionStats(workspaceId: string, eventId: string, competitionId: string, userId: string) {
    return this.workspacesService.getCompetitionStats(workspaceId, eventId, competitionId, userId);
  }
}
