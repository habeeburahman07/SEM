import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Competition } from '../workspaces/entities/competition.entity';
import { CompetitionStage } from '../workspaces/entities/competition-stage.entity';
import { Match } from '../workspaces/entities/match.entity';
import { MatchPlayer } from '../workspaces/entities/match-player.entity';
import { CompetitionTeam } from '../workspaces/entities/competition-team.entity';
import { Sport } from '../workspaces/entities/sport.entity';
import { Event } from '../workspaces/entities/event.entity';
import { Team } from '../workspaces/entities/team.entity';
import { Player } from '../workspaces/entities/player.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { WorkspaceMember } from '../workspaces/entities/workspace-member.entity';
import { NotificationType } from '../workspaces/entities/notification.entity';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { FixturesGeneratorService } from './services/fixtures-generator.service';
import { MatchLineupService } from './services/match-lineup.service';
import { StatisticsRatingsService } from './services/statistics-ratings.service';
import { BracketAdvancementService } from './services/bracket-advancement.service';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { UpdateCompetitionDto } from './dto/update-competition.dto';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';

@Injectable()
export class CompetitionsService {
  constructor(
    @InjectRepository(Competition)
    private readonly competitionRepo: Repository<Competition>,
    @InjectRepository(CompetitionStage)
    private readonly stageRepo: Repository<CompetitionStage>,
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,
    @InjectRepository(MatchPlayer)
    private readonly matchPlayerRepo: Repository<MatchPlayer>,
    @InjectRepository(CompetitionTeam)
    private readonly competitionTeamRepo: Repository<CompetitionTeam>,
    @InjectRepository(Sport)
    private readonly sportRepo: Repository<Sport>,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    @InjectRepository(Player)
    private readonly playerRepo: Repository<Player>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    private readonly workspacesService: WorkspacesService,
    private readonly fixturesGeneratorService: FixturesGeneratorService,
    private readonly matchLineupService: MatchLineupService,
    private readonly statisticsRatingsService: StatisticsRatingsService,
    private readonly bracketAdvancementService: BracketAdvancementService,
  ) {}

  // ─── Validation Helpers ───────────────────────────────────────────────────

  async validateCompetitionContext(
    workspaceId: string,
    eventId: string,
    competitionId: string,
  ): Promise<Competition> {
    const event = await this.eventRepo.findOne({ where: { id: eventId, workspaceId } });
    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found in this workspace`);
    }
    const competition = await this.competitionRepo.findOne({
      where: { id: competitionId, eventId },
      relations: { sport: true },
    });
    if (!competition) {
      throw new NotFoundException(`Competition "${competitionId}" not found in this event`);
    }
    return competition;
  }

  async validateStageContext(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    stageId: string,
  ): Promise<CompetitionStage> {
    await this.validateCompetitionContext(workspaceId, eventId, competitionId);
    const stage = await this.stageRepo.findOne({ where: { id: stageId, competitionId } });
    if (!stage) {
      throw new NotFoundException(`Stage "${stageId}" not found in this competition`);
    }
    return stage;
  }

  // ─── Competitions CRUD ────────────────────────────────────────────────────

  async getCompetitions(workspaceId: string, eventId: string, userId: string): Promise<Competition[]> {
    await this.workspacesService.ensureMember(workspaceId, userId);

    const eventExists = await this.eventRepo.exists({ where: { id: eventId, workspaceId } });
    if (!eventExists) {
      throw new NotFoundException(`Event "${eventId}" not found in workspace`);
    }

    const competitions = await this.competitionRepo.find({
      where: { eventId },
      relations: { sport: true, stages: true },
      order: { name: 'ASC' },
    });

    const allStageIds = competitions.flatMap(c => (c.stages ?? []).map(s => s.id));
    const allMatchesMap = new Map<string, any[]>();

    if (allStageIds.length > 0) {
      const allMatches = await this.matchRepo.find({
        where: { stageId: In(allStageIds) },
        relations: { homeTeam: true, awayTeam: true },
      });
      for (const m of allMatches) {
        if (!allMatchesMap.has(m.stageId)) allMatchesMap.set(m.stageId, []);
        allMatchesMap.get(m.stageId)!.push(m);
      }
    }

    return competitions.map(comp => {
      const compJson = JSON.parse(JSON.stringify(comp));
      for (const stage of compJson.stages ?? []) {
        stage.matches = allMatchesMap.get(stage.id) ?? [];
      }
      return compJson;
    });
  }

  async createCompetition(
    workspaceId: string,
    eventId: string,
    dto: CreateCompetitionDto,
    userId: string,
  ): Promise<Competition> {
    await this.workspacesService.ensurePermission(workspaceId, userId, 'competition.manage');

    const event = await this.eventRepo.findOne({ where: { id: eventId, workspaceId } });
    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found in workspace`);
    }

    const sport = await this.sportRepo.findOne({ where: { id: dto.sportId } });
    if (!sport) {
      throw new NotFoundException(`Sport with ID "${dto.sportId}" not found`);
    }

    const competition = this.competitionRepo.create({
      name: dto.name,
      eventId,
      sportId: dto.sportId,
      status: dto.status || 'upcoming',
      pointsConfig: dto.pointsConfig ?? null,
    });

    const saved = await this.competitionRepo.save(competition);
    const found = await this.competitionRepo.findOne({ where: { id: saved.id }, relations: { sport: true } });
    if (!found) {
      throw new NotFoundException(`Competition "${saved.id}" not found`);
    }

    const memberIds = await this.workspacesService.getWorkspaceMemberUserIds(workspaceId, userId);
    await this.workspacesService.sendNotificationToMany(
      memberIds,
      NotificationType.COMPETITION_CREATED,
      `New competition "${found.name}" added to ${event.name}.`,
      workspaceId,
      { eventId, competitionId: found.id, competitionName: found.name, eventName: event.name },
    );

    return found;
  }

  async updateCompetition(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    dto: UpdateCompetitionDto,
    userId: string,
  ): Promise<Competition> {
    await this.workspacesService.ensurePermission(workspaceId, userId, 'competition.manage');

    const eventExists = await this.eventRepo.exists({ where: { id: eventId, workspaceId } });
    if (!eventExists) {
      throw new NotFoundException(`Event "${eventId}" not found in workspace`);
    }

    const competition = await this.competitionRepo.findOne({
      where: { id: competitionId, eventId },
      relations: { sport: true },
    });
    if (!competition) {
      throw new NotFoundException(`Competition "${competitionId}" not found in event`);
    }

    if (dto.sportId) {
      const sport = await this.sportRepo.findOne({ where: { id: dto.sportId } });
      if (!sport) {
        throw new NotFoundException(`Sport with ID "${dto.sportId}" not found`);
      }
      competition.sportId = dto.sportId;
      competition.sport = sport;
    }

    if (dto.name !== undefined) competition.name = dto.name;
    if (dto.status !== undefined) competition.status = dto.status;
    if (dto.pointsConfig !== undefined) competition.pointsConfig = dto.pointsConfig ?? null;

    return this.competitionRepo.save(competition);
  }

  async removeCompetition(workspaceId: string, eventId: string, competitionId: string, userId: string): Promise<void> {
    await this.workspacesService.ensurePermission(workspaceId, userId, 'competition.manage');
    const eventExists = await this.eventRepo.exists({ where: { id: eventId, workspaceId } });
    if (!eventExists) {
      throw new NotFoundException(`Event "${eventId}" not found in workspace`);
    }

    const competition = await this.competitionRepo.findOne({ where: { id: competitionId, eventId } });
    if (!competition) {
      throw new NotFoundException(`Competition "${competitionId}" not found in event`);
    }

    await this.competitionRepo.remove(competition);
  }

  // ─── Competition Teams ───────────────────────────────────────────────────

  async getCompetitionTeams(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    userId: string,
  ): Promise<CompetitionTeam[]> {
    await this.workspacesService.ensureMember(workspaceId, userId);
    const event = await this.eventRepo.findOne({
      where: { id: eventId, workspaceId },
      relations: { teams: true },
    });
    if (!event) throw new NotFoundException(`Event not found`);
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId, eventId } });
    if (!competition) throw new NotFoundException(`Competition "${competitionId}" not found`);

    const eventTeams = event.teams || [];
    const uniqueTeams = Array.from(new Map(eventTeams.map((t) => [t.id, t])).values());
    return uniqueTeams.map((t) => ({
      id: `${competitionId}-${t.id}`,
      competitionId,
      teamId: t.id,
      team: t,
      createdAt: event.createdAt,
    })) as CompetitionTeam[];
  }

  async addTeamToCompetition(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    teamId: string,
    userId: string,
  ): Promise<CompetitionTeam> {
    await this.workspacesService.ensurePermission(workspaceId, userId, 'competition.manage');
    await this.validateCompetitionContext(workspaceId, eventId, competitionId);
    const team = await this.teamRepo.findOne({ where: { id: teamId, workspaceId } });
    if (!team) throw new NotFoundException(`Team "${teamId}" not found in workspace`);
    const existing = await this.competitionTeamRepo.findOne({ where: { competitionId, teamId } });
    if (existing) throw new ConflictException(`Team is already enrolled in this competition`);
    const entry = this.competitionTeamRepo.create({ competitionId, teamId });
    const saved = await this.competitionTeamRepo.save(entry);
    const foundEntry = await this.competitionTeamRepo.findOne({ where: { id: saved.id }, relations: { team: true } });

    if (foundEntry) {
      const comp = await this.competitionRepo.findOne({ where: { id: competitionId } });
      const players = await this.workspacesService.getTeamPlayerUserIds(teamId);
      await this.workspacesService.sendNotificationToMany(
        players,
        NotificationType.TEAM_ADDED_TO_COMPETITION,
        `Your team ${foundEntry.team.name} has been registered for ${comp?.name ?? 'a competition'}.`,
        workspaceId,
        { teamId, teamName: foundEntry.team.name, competitionId, competitionName: comp?.name },
      );
    }

    return foundEntry as any;
  }

  async removeTeamFromCompetition(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    teamId: string,
    userId: string,
  ): Promise<void> {
    await this.workspacesService.ensurePermission(workspaceId, userId, 'competition.manage');
    await this.validateCompetitionContext(workspaceId, eventId, competitionId);
    const entry = await this.competitionTeamRepo.findOne({ where: { competitionId, teamId } });
    if (!entry) throw new NotFoundException(`Team is not enrolled in this competition`);

    const team = await this.teamRepo.findOne({ where: { id: teamId } });
    const comp = await this.competitionRepo.findOne({ where: { id: competitionId } });

    await this.competitionTeamRepo.remove(entry);

    const players = await this.workspacesService.getTeamPlayerUserIds(teamId);
    await this.workspacesService.sendNotificationToMany(
      players,
      NotificationType.TEAM_REMOVED_FROM_COMPETITION,
      `Your team ${team?.name ?? 'Unknown'} has been withdrawn from ${comp?.name ?? 'the competition'}.`,
      workspaceId,
      { teamId, teamName: team?.name, competitionId, competitionName: comp?.name },
    );
  }

  // ─── Fixture Generator ──────────────────────────────────────────────────

  async generateFixtures(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    userId: string,
  ): Promise<{ stagesGenerated: number; matchesCreated: number }> {
    return this.fixturesGeneratorService.generateFixtures(workspaceId, eventId, competitionId, userId);
  }

  // ─── Competition Stages ─────────────────────────────────────────────────

  async getStages(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    userId: string,
  ): Promise<CompetitionStage[]> {
    await this.workspacesService.ensureMember(workspaceId, userId);

    const compExists = await this.competitionRepo
      .createQueryBuilder('c')
      .innerJoin('c.event', 'e', 'e.id = :eventId AND e.workspaceId = :workspaceId', { eventId, workspaceId })
      .where('c.id = :competitionId', { competitionId })
      .getExists();
    if (!compExists) {
      throw new NotFoundException(`Competition "${competitionId}" not found in event`);
    }

    return this.stageRepo.find({
      where: { competitionId },
      order: { sequence: 'ASC', createdAt: 'ASC' },
    });
  }

  async createStage(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    dto: CreateStageDto,
    userId: string,
  ): Promise<CompetitionStage> {
    await this.workspacesService.ensurePermission(workspaceId, userId, 'competition.manage');
    const event = await this.eventRepo.findOne({ where: { id: eventId, workspaceId } });
    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found in workspace`);
    }
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId, eventId } });
    if (!competition) {
      throw new NotFoundException(`Competition "${competitionId}" not found in event`);
    }

    const sequence = dto.sequence ?? (await this.stageRepo.count({ where: { competitionId } })) + 1;

    const stage = this.stageRepo.create({
      name: dto.name,
      type: dto.type,
      sequence,
      competitionId,
      config: dto.config ?? {},
    });

    return this.stageRepo.save(stage);
  }

  async updateStage(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    stageId: string,
    dto: UpdateStageDto,
    userId: string,
  ): Promise<CompetitionStage> {
    await this.workspacesService.ensurePermission(workspaceId, userId, 'competition.manage');
    const event = await this.eventRepo.findOne({ where: { id: eventId, workspaceId } });
    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found in workspace`);
    }
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId, eventId } });
    if (!competition) {
      throw new NotFoundException(`Competition "${competitionId}" not found in event`);
    }

    const stage = await this.stageRepo.findOne({ where: { id: stageId, competitionId } });
    if (!stage) {
      throw new NotFoundException(`Stage "${stageId}" not found in competition`);
    }

    if (dto.name !== undefined) stage.name = dto.name;
    if (dto.type !== undefined) stage.type = dto.type;
    if (dto.sequence !== undefined) stage.sequence = dto.sequence;
    if (dto.config !== undefined) {
      stage.config = { ...stage.config, ...dto.config };
    }

    return this.stageRepo.save(stage);
  }

  async removeStage(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    stageId: string,
    userId: string,
  ): Promise<void> {
    await this.workspacesService.ensurePermission(workspaceId, userId, 'competition.manage');
    const event = await this.eventRepo.findOne({ where: { id: eventId, workspaceId } });
    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found in workspace`);
    }
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId, eventId } });
    if (!competition) {
      throw new NotFoundException(`Competition "${competitionId}" not found in event`);
    }

    const stage = await this.stageRepo.findOne({ where: { id: stageId, competitionId } });
    if (!stage) {
      throw new NotFoundException(`Stage "${stageId}" not found in competition`);
    }

    await this.stageRepo.remove(stage);
  }

  async resetStagesAndFixtures(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    userId: string,
  ): Promise<void> {
    return this.fixturesGeneratorService.resetStagesAndFixtures(workspaceId, eventId, competitionId, userId);
  }

  // ─── Matches ────────────────────────────────────────────────────────────

  async getMatches(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    stageId: string,
    userId: string,
  ): Promise<Match[]> {
    return this.matchLineupService.getMatches(workspaceId, eventId, competitionId, stageId, userId);
  }

  async createMatch(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    stageId: string,
    dto: CreateMatchDto,
    userId: string,
  ): Promise<Match> {
    return this.matchLineupService.createMatch(workspaceId, eventId, competitionId, stageId, dto, userId);
  }

  async updateMatch(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    stageId: string,
    matchId: string,
    dto: UpdateMatchDto,
    userId: string,
  ): Promise<Match> {
    return this.matchLineupService.updateMatch(workspaceId, eventId, competitionId, stageId, matchId, dto, userId);
  }

  async removeMatch(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    stageId: string,
    matchId: string,
    userId: string,
  ): Promise<void> {
    return this.matchLineupService.removeMatch(workspaceId, eventId, competitionId, stageId, matchId, userId);
  }

  // ─── Match Lineup ───────────────────────────────────────────────────────

  async getMatchLineup(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    stageId: string,
    matchId: string,
    userId: string,
  ): Promise<MatchPlayer[]> {
    return this.matchLineupService.getMatchLineup(workspaceId, eventId, competitionId, stageId, matchId, userId);
  }

  async saveMatchLineup(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    stageId: string,
    matchId: string,
    lineups: { playerId: string; isPlaying: boolean; teamId: string; isGoalkeeper?: boolean }[],
    userId: string,
  ): Promise<MatchPlayer[]> {
    return this.matchLineupService.saveMatchLineup(workspaceId, eventId, competitionId, stageId, matchId, lineups, userId);
  }

  // ─── Player Ratings ─────────────────────────────────────────────────────

  async getMatchRatings(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    stageId: string,
    matchId: string,
    userId: string,
  ): Promise<MatchPlayer[]> {
    return this.statisticsRatingsService.getMatchRatings(workspaceId, eventId, competitionId, stageId, matchId, userId);
  }

  async setMatchPlayerRatings(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    stageId: string,
    matchId: string,
    ratings: any[],
    userId: string,
  ): Promise<MatchPlayer[]> {
    return this.statisticsRatingsService.setMatchPlayerRatings(workspaceId, eventId, competitionId, stageId, matchId, ratings, userId);
  }

  // ─── Competition Analytics ──────────────────────────────────────────────

  async getCompetitionBestPlayer(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    userId: string,
  ): Promise<{
    bestPlayer: MatchPlayer | null;
    allRankings: Array<{
      playerId: string;
      playerName: string;
      teamName: string;
      avgRating: number;
      appearances: number;
      eligible: boolean;
    }>;
    totalMatches: number;
    minAppearancesRequired: number;
  }> {
    return this.statisticsRatingsService.getCompetitionBestPlayer(workspaceId, eventId, competitionId, userId);
  }

  async getCompetitionStats(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    userId: string,
  ): Promise<any> {
    return this.statisticsRatingsService.getCompetitionStats(workspaceId, eventId, competitionId, userId);
  }

  async getCompetitionRankings(competitionId: string): Promise<Map<string, number>> {
    return this.bracketAdvancementService.getCompetitionRankings(competitionId);
  }
}
