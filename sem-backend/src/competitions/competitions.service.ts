import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Competition } from '../workspaces/entities/competition.entity';
import { CompetitionStage } from '../workspaces/entities/competition-stage.entity';
import { Match, MatchType } from '../workspaces/entities/match.entity';
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
    await this.workspacesService.ensurePermission(workspaceId, userId, 'competition.manage');

    const event = await this.eventRepo.findOne({
      where: { id: eventId, workspaceId },
      relations: { teams: true },
    });
    if (!event) throw new NotFoundException(`Event not found`);

    const competition = await this.competitionRepo.findOne({ where: { id: competitionId, eventId } });
    if (!competition) throw new NotFoundException(`Competition not found`);

    const eventTeams = event.teams || [];
    const uniqueTeams = Array.from(new Map(eventTeams.map((t) => [t.id, t])).values());
    if (uniqueTeams.length < 2) {
      throw new BadRequestException('At least 2 teams must be mapped to the event before generating fixtures.');
    }

    const stages = await this.stageRepo.find({
      where: { competitionId },
      order: { sequence: 'ASC', createdAt: 'ASC' },
    });
    if (stages.length === 0) {
      throw new BadRequestException('Configure at least one stage before generating fixtures.');
    }

    const teamIds = uniqueTeams.map((t) => t.id);
    this.shuffleArray(teamIds);

    let totalMatches = 0;

    for (const stage of stages) {
      const existing = await this.matchRepo.find({ where: { stageId: stage.id } });
      if (existing.length) await this.matchRepo.remove(existing);

      const fixtures: Array<{ homeTeamId: string | null; awayTeamId: string | null; config: any }> = [];

      if (stage.type === 'league' || stage.type === 'group') {
        const twoLegged = stage.config?.twoLegged || stage.config?.legs === 2;
        const roundRobin = this.generateRoundRobin(teamIds, twoLegged);
        for (const pair of roundRobin) {
          fixtures.push({
            homeTeamId: pair[0],
            awayTeamId: pair[1],
            config: { round: 'League Stage' },
          });
        }
      } else if (stage.type === 'knockout') {
        const twoLegged = stage.config?.twoLegged || stage.config?.legs === 2;
        const isFirstStage = stage.id === stages[0].id;

        if (isFirstStage) {
          const n = teamIds.length;
          const bracketSize = Math.pow(2, Math.ceil(Math.log2(Math.max(n, 2))));
          const padded: (string | null)[] = [...teamIds, ...Array(bracketSize - n).fill(null)];

          const roundLabel = bracketSize === 2 ? 'Final' : bracketSize === 4 ? 'Semi-Final' : bracketSize === 8 ? 'Quarter-Final' : `Round of ${bracketSize}`;
          for (let i = 0; i < padded.length; i += 2) {
            const home = padded[i];
            const away = padded[i + 1];
            if (home === null && away === null) continue;
            fixtures.push({
              homeTeamId: home,
              awayTeamId: away,
              config: twoLegged ? { round: roundLabel, leg: 1 } : { round: roundLabel },
            });
            if (twoLegged && home !== null && away !== null) {
              fixtures.push({
                homeTeamId: away,
                awayTeamId: home,
                config: { round: roundLabel, leg: 2 },
              });
            }
          }

          let remainingTeams = bracketSize / 2;
          while (remainingTeams >= 2) {
            const subRoundLabel = remainingTeams === 2 ? 'Final' : remainingTeams === 4 ? 'Semi-Final' : remainingTeams === 8 ? 'Quarter-Final' : `Round of ${remainingTeams * 2}`;
            const matchesInRound = remainingTeams / 2;
            for (let m = 0; m < matchesInRound; m++) {
              fixtures.push({
                homeTeamId: null,
                awayTeamId: null,
                config: twoLegged ? { round: subRoundLabel, leg: 1 } : { round: subRoundLabel },
              });
              if (twoLegged) {
                fixtures.push({
                  homeTeamId: null,
                  awayTeamId: null,
                  config: { round: subRoundLabel, leg: 2 },
                });
              }
            }
            if (remainingTeams === 2) {
              fixtures.push({
                homeTeamId: null,
                awayTeamId: null,
                config: twoLegged ? { round: 'Third Place Match', leg: 1 } : { round: 'Third Place Match' },
              });
              if (twoLegged) {
                fixtures.push({
                  homeTeamId: null,
                  awayTeamId: null,
                  config: { round: 'Third Place Match', leg: 2 },
                });
              }
            }
            remainingTeams = remainingTeams / 2;
          }
        }
      } else if (stage.type === 'group_knockout') {
        const isSingleGroup = stage.config?.groupKnockoutSubtype === 'single_group';
        const twoLeggedGroup = stage.config?.twoLegged || stage.config?.legs === 2;
        const twoLeggedKO = stage.config?.twoLegged || stage.config?.legs === 2;

        let totalAdvancing = 2;

        if (isSingleGroup) {
          const roundRobin = this.generateRoundRobin(teamIds, twoLeggedGroup);
          for (const pair of roundRobin) {
            fixtures.push({
              homeTeamId: pair[0],
              awayTeamId: pair[1],
              config: { round: 'Group Stage' },
            });
          }
          totalAdvancing = Number(stage.config?.singleGroupAdvancing ?? 2);
        } else {
          const groupsCount = stage.config?.groupsCount ?? 2;
          const groups: string[][] = Array.from({ length: groupsCount }, () => []);
          teamIds.forEach((id, idx) => groups[idx % groupsCount].push(id));

          for (let gIndex = 0; gIndex < groups.length; gIndex++) {
            const group = groups[gIndex];
            const groupChar = String.fromCharCode(65 + gIndex);
            if (group.length < 2) continue;
            const roundRobin = this.generateRoundRobin(group, twoLeggedGroup);
            for (const pair of roundRobin) {
              fixtures.push({
                homeTeamId: pair[0],
                awayTeamId: pair[1],
                config: { round: `Group ${groupChar}` },
              });
            }
          }

          const isWinnerAndRunner = stage.config?.advancingType === 'winner_and_runner';
          totalAdvancing = groupsCount * (isWinnerAndRunner ? 2 : 1);
        }

        let koTeamsCount = totalAdvancing;
        const bracketSize = Math.pow(2, Math.ceil(Math.log2(Math.max(koTeamsCount, 2))));

        let remainingTeams = bracketSize;
        while (remainingTeams >= 2) {
          const koRoundLabel = remainingTeams === 2 ? 'Final' : remainingTeams === 4 ? 'Semi-Final' : remainingTeams === 8 ? 'Quarter-Final' : `Round of ${remainingTeams}`;
          const matchesInRound = remainingTeams / 2;
          for (let m = 0; m < matchesInRound; m++) {
            fixtures.push({
              homeTeamId: null,
              awayTeamId: null,
              config: twoLeggedKO ? { round: koRoundLabel, leg: 1 } : { round: koRoundLabel },
            });
            if (twoLeggedKO) {
              fixtures.push({
                homeTeamId: null,
                awayTeamId: null,
                config: { round: koRoundLabel, leg: 2 },
              });
            }
          }
          if (remainingTeams === 2) {
            fixtures.push({
              homeTeamId: null,
              awayTeamId: null,
              config: twoLeggedKO ? { round: 'Third Place Match', leg: 1 } : { round: 'Third Place Match' },
            });
            if (twoLeggedKO) {
              fixtures.push({
                homeTeamId: null,
                awayTeamId: null,
                config: { round: 'Third Place Match', leg: 2 },
              });
            }
          }
          remainingTeams = remainingTeams / 2;
        }
      }

      for (const f of fixtures) {
        const m = this.matchRepo.create({
          stageId: stage.id,
          homeTeamId: f.homeTeamId,
          awayTeamId: f.awayTeamId,
          status: 'scheduled',
          config: f.config,
          liveData: {},
        });
        await this.matchRepo.save(m);
        totalMatches++;
      }
    }

    const compTeams = await this.competitionTeamRepo.find({ where: { competitionId } });
    const teamIdsNotify = compTeams.map((ct) => ct.teamId);
    const players = await this.workspacesService.getTeamsPlayerUserIds(teamIdsNotify);
    await this.workspacesService.sendNotificationToMany(
      players,
      NotificationType.FIXTURES_GENERATED,
      `Fixtures generated for competition "${competition.name}".`,
      workspaceId,
      { competitionId, competitionName: competition.name },
    );

    return { stagesGenerated: stages.length, matchesCreated: totalMatches };
  }

  private shuffleArray<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  private generateRoundRobin(teams: string[], twoLegged: boolean): [string, string][] {
    const matches: [string, string][] = [];
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        matches.push([teams[i], teams[j]]);
        if (twoLegged) matches.push([teams[j], teams[i]]);
      }
    }
    return matches;
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
    await this.workspacesService.ensurePermission(workspaceId, userId, 'competition.manage');
    const event = await this.eventRepo.findOne({ where: { id: eventId, workspaceId } });
    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found in workspace`);
    }
    const competition = await this.competitionRepo.findOne({ where: { id: competitionId, eventId } });
    if (!competition) {
      throw new NotFoundException(`Competition "${competitionId}" not found in event`);
    }

    const stages = await this.stageRepo.find({ where: { competitionId } });
    if (stages.length > 0) {
      await this.stageRepo.remove(stages);
    }

    const compTeams = await this.competitionTeamRepo.find({ where: { competitionId } });
    const teamIds = compTeams.map((ct) => ct.teamId);
    const players = await this.workspacesService.getTeamsPlayerUserIds(teamIds);
    await this.workspacesService.sendNotificationToMany(
      players,
      NotificationType.FIXTURES_RESET,
      `Fixtures for competition "${competition.name}" have been reset.`,
      workspaceId,
      { competitionId, competitionName: competition.name },
    );
  }

  // ─── Matches ────────────────────────────────────────────────────────────

  async getMatches(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    stageId: string,
    userId: string,
  ): Promise<Match[]> {
    await this.workspacesService.ensureMember(workspaceId, userId);
    const stage = await this.validateStageContext(workspaceId, eventId, competitionId, stageId);

    try {
      if (stage.type === 'knockout') {
        const stages = await this.stageRepo.find({
          where: { competitionId },
          order: { sequence: 'ASC', createdAt: 'ASC' }
        });
        const idx = stages.findIndex(s => s.id === stageId);
        if (idx > 0) {
          const prevStage = stages[idx - 1];
          await this.advanceTeamsBetweenStages(prevStage);
        }
      } else if (stage.type === 'group_knockout') {
        await this.advanceGroupStageWinners(stage);
      }
    } catch (err) {
      console.error('Self-healing stage advancement failed:', err);
    }

    const matches = await this.matchRepo.find({
      where: { stageId },
      relations: { homeTeam: true, awayTeam: true, venue: true },
      order: { createdAt: 'ASC' },
    });

    const completedMatches = matches.filter(m => m.status === 'completed');
    if (completedMatches.length > 0) {
      const matchIds = completedMatches.map(m => m.id);
      const matchPlayers = await this.matchPlayerRepo.find({
        where: { matchId: In(matchIds), isPlaying: true },
        relations: { player: { user: true }, team: true },
      });

      const playersByMatch = new Map<string, MatchPlayer[]>();
      for (const mp of matchPlayers) {
        if (!playersByMatch.has(mp.matchId)) {
          playersByMatch.set(mp.matchId, []);
        }
        playersByMatch.get(mp.matchId)!.push(mp);
      }

      for (const m of matches) {
        if (m.status !== 'completed') continue;
        const players = playersByMatch.get(m.id) ?? [];
        let maxRating = -1;
        let mvpMp: MatchPlayer | null = null;
        for (const mp of players) {
          if (mp.rating !== null) {
            const r = Number(mp.rating);
            if (r > maxRating) {
              maxRating = r;
              mvpMp = mp;
            }
          }
        }
        if (mvpMp && maxRating >= 5.0) {
          const playerName = mvpMp.player?.user?.username ?? mvpMp.player?.jerseyNumber?.toString() ?? 'Player';
          (m as any).mvp = {
            playerId: mvpMp.playerId,
            playerName,
            teamName: mvpMp.team?.name ?? 'Unknown',
            rating: maxRating,
          };
        }
      }
    }

    const statusWeight = {
      'live': 1,
      'scheduled': 2,
      'completed': 3,
    };

    return matches.sort((a, b) => {
      const wA = statusWeight[a.status] || 99;
      const wB = statusWeight[b.status] || 99;
      if (wA !== wB) return wA - wB;
      const timeA = a.createdAt?.getTime() || 0;
      const timeB = b.createdAt?.getTime() || 0;
      return timeA - timeB;
    });
  }

  async createMatch(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    stageId: string,
    dto: CreateMatchDto,
    userId: string,
  ): Promise<Match> {
    await this.workspacesService.ensurePermission(workspaceId, userId, 'competition.manage');
    const stage = await this.validateStageContext(workspaceId, eventId, competitionId, stageId);

    const comp = await this.competitionRepo.findOne({
      where: { id: competitionId },
      relations: { sport: true },
    });
    if (!comp) {
      throw new NotFoundException(`Competition "${competitionId}" not found`);
    }

    const sportCode = comp.sport?.code ?? 'football';
    const config = dto.config ?? {};
    let liveData: any = {};

    if (sportCode === 'football') {
      if (!config.timerDuration) config.timerDuration = 90;
      liveData = {
        elapsedSeconds: 0,
        timerRunning: false,
        events: [],
      };
    } else if (sportCode === 'cricket') {
      if (!config.overs) config.overs = 20;
      liveData = {
        tossWinnerId: null,
        tossChoice: null,
        currentInnings: 1,
        inningsData: [
          {
            battingTeamId: dto.homeTeamId,
            bowlingTeamId: dto.awayTeamId,
            runs: 0,
            wickets: 0,
            overs: 0,
            balls: 0,
            batsmanStats: {},
            bowlerStats: {},
            extraRuns: 0,
            completed: false,
          },
        ],
      };
    } else if (sportCode === 'badminton') {
      if (!config.setsToWin) config.setsToWin = 2;
      if (!config.matchType) config.matchType = MatchType.MENS_SINGLES;
      liveData = {
        currentSet: 1,
        setsScore: [{ home: 0, away: 0 }],
        homeSetsWon: 0,
        awaySetsWon: 0,
        matchStatus: 'Scheduled',
        rallies: [],
      };
    }

    const match = this.matchRepo.create({
      stageId,
      homeTeamId: dto.homeTeamId,
      awayTeamId: dto.awayTeamId,
      venueId: dto.venueId ?? null,
      homeScore: 0,
      awayScore: 0,
      status: 'scheduled',
      config,
      liveData,
    });

    const saved = await this.matchRepo.save(match);
    const populated = (await this.matchRepo.findOne({
      where: { id: saved.id },
      relations: { homeTeam: true, awayTeam: true, venue: true },
    }))!;

    if (populated.homeTeamId && populated.awayTeamId) {
      const homePlayers = await this.workspacesService.getTeamPlayerUserIds(populated.homeTeamId);
      const awayPlayers = await this.workspacesService.getTeamPlayerUserIds(populated.awayTeamId);
      const allPlayers = [...homePlayers, ...awayPlayers];
      await this.workspacesService.sendNotificationToMany(
        allPlayers,
        NotificationType.MATCH_SCHEDULED,
        `New match scheduled: ${populated.homeTeam?.name ?? 'Home'} vs ${populated.awayTeam?.name ?? 'Away'} in ${comp.name}.`,
        workspaceId,
        { matchId: populated.id, competitionId, competitionName: comp.name, homeTeamName: populated.homeTeam?.name, awayTeamName: populated.awayTeam?.name },
      );
    }

    return populated;
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
    await this.workspacesService.ensurePermission(workspaceId, userId, 'match.score');
    const stage = await this.validateStageContext(workspaceId, eventId, competitionId, stageId);

    const match = await this.matchRepo.findOne({
      where: { id: matchId, stageId },
      relations: { homeTeam: true, awayTeam: true },
    });
    if (!match) {
      throw new NotFoundException(`Match "${matchId}" not found in this stage`);
    }

    const oldStatus = match.status;

    if (dto.homeScore !== undefined) match.homeScore = dto.homeScore;
    if (dto.awayScore !== undefined) match.awayScore = dto.awayScore;
    if (dto.status !== undefined) match.status = dto.status;
    if (dto.venueId !== undefined) match.venueId = dto.venueId;
    if (dto.config !== undefined) {
      match.config = { ...match.config, ...dto.config };
    }
    if (dto.liveData !== undefined) {
      match.liveData = dto.liveData;
    }

    const saved = await this.matchRepo.save(match);

    const populated = (await this.matchRepo.findOne({
      where: { id: saved.id },
      relations: { homeTeam: true, awayTeam: true, venue: true },
    }))!;

    if (dto.status !== undefined && dto.status !== oldStatus) {
      const homePlayers = await this.workspacesService.getTeamPlayerUserIds(populated.homeTeamId!);
      const awayPlayers = await this.workspacesService.getTeamPlayerUserIds(populated.awayTeamId!);
      const allPlayers = [...homePlayers, ...awayPlayers];

      if (dto.status === 'live') {
        await this.workspacesService.sendNotificationToMany(
          allPlayers,
          NotificationType.MATCH_STARTED,
          `Match has started: ${populated.homeTeam?.name ?? 'Home'} vs ${populated.awayTeam?.name ?? 'Away'}.`,
          workspaceId,
          { matchId: populated.id, homeTeamName: populated.homeTeam?.name, awayTeamName: populated.awayTeam?.name },
        );
      } else if (dto.status === 'completed') {
        await this.workspacesService.sendNotificationToMany(
          allPlayers,
          NotificationType.MATCH_COMPLETED,
          `Match completed: ${populated.homeTeam?.name ?? 'Home'} (${populated.homeScore}) vs ${populated.awayTeam?.name ?? 'Away'} (${populated.awayScore}).`,
          workspaceId,
          { matchId: populated.id, homeScore: populated.homeScore, awayScore: populated.awayScore, homeTeamName: populated.homeTeam?.name, awayTeamName: populated.awayTeam?.name },
        );

        await this.autoRateMatchPlayers(saved);

        if (stage.type === 'knockout') {
          await this.advanceKnockoutWinner(saved, stage);
        } else if (stage.type === 'group_knockout') {
          await this.advanceGroupStageWinners(stage);
        }

        await this.checkAndAutoCompleteCompetition(competitionId);
      }
    }

    return populated;
  }

  async removeMatch(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    stageId: string,
    matchId: string,
    userId: string,
  ): Promise<void> {
    await this.workspacesService.ensurePermission(workspaceId, userId, 'competition.manage');
    await this.validateStageContext(workspaceId, eventId, competitionId, stageId);
    const match = await this.matchRepo.findOne({ where: { id: matchId, stageId } });
    if (!match) {
      throw new NotFoundException(`Match "${matchId}" not found in stage`);
    }
    await this.matchRepo.remove(match);
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
    await this.workspacesService.ensureMember(workspaceId, userId);
    await this.validateStageContext(workspaceId, eventId, competitionId, stageId);

    const match = await this.matchRepo.findOne({
      where: { id: matchId, stageId },
    });
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    return this.matchPlayerRepo.find({
      where: { matchId },
      relations: {
        player: {
          user: true,
        },
        team: true,
      },
    });
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
    await this.workspacesService.ensurePermission(workspaceId, userId, 'match.score');
    await this.validateStageContext(workspaceId, eventId, competitionId, stageId);

    const match = await this.matchRepo.findOne({
      where: { id: matchId, stageId },
    });
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    const existing = await this.matchPlayerRepo.find({
      where: { matchId },
    });
    const existingMap = new Map<string, MatchPlayer>();
    for (const entry of existing) {
      existingMap.set(entry.playerId, entry);
    }

    const toSave: MatchPlayer[] = [];
    const processedPlayerIds = new Set<string>();

    for (const item of lineups) {
      processedPlayerIds.add(item.playerId);
      let entry = existingMap.get(item.playerId);
      const isGK = item.isGoalkeeper ?? false;
      if (entry) {
        entry.isPlaying = item.isPlaying;
        entry.teamId = item.teamId;
        entry.isGoalkeeper = isGK;
      } else {
        entry = this.matchPlayerRepo.create({
          matchId,
          playerId: item.playerId,
          teamId: item.teamId,
          isPlaying: item.isPlaying,
          isGoalkeeper: isGK,
        });
      }
      toSave.push(entry);
    }

    await this.matchPlayerRepo.save(toSave);

    const toDelete: MatchPlayer[] = [];
    for (const entry of existing) {
      if (!processedPlayerIds.has(entry.playerId)) {
        toDelete.push(entry);
      }
    }
    if (toDelete.length > 0) {
      await this.matchPlayerRepo.remove(toDelete);
    }

    const result = await this.matchPlayerRepo.find({
      where: { matchId },
      relations: {
        player: {
          user: true,
        },
        team: true,
      },
    });

    const matchDetails = await this.matchRepo.findOne({
      where: { id: matchId },
      relations: { homeTeam: true, awayTeam: true }
    });
    const selectedPlayers = result.filter(mp => mp.isPlaying);
    for (const sp of selectedPlayers) {
      if (sp.player?.userId) {
        await this.workspacesService.sendNotification(
          sp.player.userId,
          NotificationType.MATCH_LINEUP_SET,
          `You've been selected in the lineup for ${matchDetails?.homeTeam?.name ?? 'Home'} vs ${matchDetails?.awayTeam?.name ?? 'Away'}.`,
          workspaceId,
          { matchId, homeTeamName: matchDetails?.homeTeam?.name, awayTeamName: matchDetails?.awayTeam?.name }
        );
      }
    }

    return result;
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
    await this.workspacesService.ensureMember(workspaceId, userId);
    await this.validateStageContext(workspaceId, eventId, competitionId, stageId);

    const match = await this.matchRepo.findOne({ where: { id: matchId, stageId } });
    if (!match) throw new NotFoundException('Match not found');

    return this.matchPlayerRepo.find({
      where: { matchId, isPlaying: true },
      relations: { player: { user: true }, team: true },
      order: { rating: 'DESC' },
    });
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
    await this.workspacesService.ensurePermission(workspaceId, userId, 'match.score');
    await this.validateStageContext(workspaceId, eventId, competitionId, stageId);

    const match = await this.matchRepo.findOne({ where: { id: matchId, stageId } });
    if (!match) throw new NotFoundException('Match not found');

    const players = await this.matchPlayerRepo.find({ where: { matchId } });
    const playerMap = new Map(players.map((p) => [p.playerId, p]));

    const toSave: MatchPlayer[] = [];
    for (const item of ratings) {
      const entry = playerMap.get(item.playerId);
      if (!entry) continue;
      entry.rating = Math.min(10.0, Math.max(5.0, item.rating));
      toSave.push(entry);
    }

    const savedRatings = await this.matchPlayerRepo.save(toSave);
    const populatedSaved = await this.matchPlayerRepo.find({
      where: { id: In(savedRatings.map((s) => s.id)) },
      relations: { player: { user: true }, team: true },
    });

    const matchDetails = await this.matchRepo.findOne({
      where: { id: matchId },
      relations: { homeTeam: true, awayTeam: true },
    });

    for (const entry of populatedSaved) {
      if (entry.player?.userId && entry.rating !== null) {
        await this.workspacesService.sendNotification(
          entry.player.userId,
          NotificationType.PLAYER_RATING_UPDATED,
          `Your match rating has been updated to ${entry.rating}/10 for ${matchDetails?.homeTeam?.name} vs ${matchDetails?.awayTeam?.name}.`,
          workspaceId,
          { matchId, rating: entry.rating },
        );
      }
    }

    return this.matchPlayerRepo.find({
      where: { matchId, isPlaying: true },
      relations: { player: { user: true }, team: true },
      order: { rating: 'DESC' },
    });
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
    await this.workspacesService.ensureMember(workspaceId, userId);
    await this.validateCompetitionContext(workspaceId, eventId, competitionId);

    const stages = await this.stageRepo.find({ where: { competitionId } });
    const stageIds = stages.map((s) => s.id);
    if (stageIds.length === 0) {
      return { bestPlayer: null, allRankings: [], totalMatches: 0, minAppearancesRequired: 0 };
    }

    const allMatches = await this.matchRepo.find({
      where: { stageId: In(stageIds), status: 'completed' },
    });
    const totalMatches = allMatches.length;
    if (totalMatches === 0) {
      return { bestPlayer: null, allRankings: [], totalMatches: 0, minAppearancesRequired: 0 };
    }

    const matchIds = allMatches.map((m) => m.id);
    const minAppearancesRequired = Math.ceil(totalMatches * 0.5);

    const allMatchPlayers = await this.matchPlayerRepo.find({
      where: { matchId: In(matchIds), isPlaying: true },
      relations: { player: { user: true }, team: true },
    });

    const playerStats = new Map<
      string,
      { entry: MatchPlayer; ratings: number[]; teamName: string; playerName: string }
    >();

    for (const mp of allMatchPlayers) {
      if (mp.rating === null) continue;
      const existing = playerStats.get(mp.playerId);
      const playerName =
        mp.player?.user?.username ?? mp.player?.jerseyNumber?.toString() ?? mp.playerId;
      const teamName = mp.team?.name ?? 'Unknown';
      if (existing) {
        existing.ratings.push(Number(mp.rating));
      } else {
        playerStats.set(mp.playerId, {
          entry: mp,
          ratings: [Number(mp.rating)],
          playerName,
          teamName,
        });
      }
    }

    const rankings: Array<{
      playerId: string;
      playerName: string;
      teamName: string;
      avgRating: number;
      appearances: number;
      eligible: boolean;
    }> = [];

    for (const [playerId, stats] of playerStats.entries()) {
      const appearances = stats.ratings.length;
      const avgRating =
        Math.round((stats.ratings.reduce((a, b) => a + b, 0) / appearances) * 100) / 100;
      rankings.push({
        playerId,
        playerName: stats.playerName,
        teamName: stats.teamName,
        avgRating,
        appearances,
        eligible: appearances >= minAppearancesRequired,
      });
    }

    rankings.sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return b.avgRating - a.avgRating;
    });

    const topEligible = rankings.find((r) => r.eligible) ?? null;
    let bestPlayer: MatchPlayer | null = null;
    if (topEligible) {
      bestPlayer =
        playerStats.get(topEligible.playerId)?.entry ?? null;
    }

    return { bestPlayer, allRankings: rankings, totalMatches, minAppearancesRequired };
  }

  async getCompetitionStats(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    userId: string,
  ): Promise<any> {
    await this.workspacesService.ensureMember(workspaceId, userId);
    const competition = await this.validateCompetitionContext(workspaceId, eventId, competitionId);

    const sportCode = competition.sport?.code ?? 'football';

    const stages = await this.stageRepo.find({ where: { competitionId } });
    const stageIds = stages.map((s) => s.id);
    if (stageIds.length === 0) {
      return { sportCode, topRated: [] };
    }

    const completedMatches = await this.matchRepo.find({
      where: { stageId: In(stageIds), status: 'completed' },
    });
    if (completedMatches.length === 0) {
      return { sportCode, topRated: [] };
    }

    const matchIds = completedMatches.map((m) => m.id);

    const allMatchPlayers = await this.matchPlayerRepo.find({
      where: { matchId: In(matchIds), isPlaying: true },
      relations: { player: { user: true }, team: true },
    });

    const userUserIdMap = new Map<string, { playerId: string; playerName: string; teamName: string }>();
    const userUsernameMap = new Map<string, { playerId: string; playerName: string; teamName: string }>();
    const ratingsMap = new Map<string, { playerId: string; playerName: string; teamName: string; ratings: number[] }>();

    for (const mp of allMatchPlayers) {
      const playerName = mp.player?.user?.username ?? mp.player?.jerseyNumber?.toString() ?? mp.playerId;
      const teamName = mp.team?.name ?? 'Unknown';
      const pInfo = { playerId: mp.playerId, playerName, teamName };

      if (mp.player?.userId) {
        userUserIdMap.set(mp.player.userId, pInfo);
      }
      if (mp.player?.user?.username) {
        userUsernameMap.set(mp.player.user.username, pInfo);
      }

      if (mp.rating !== null) {
        let existing = ratingsMap.get(mp.playerId);
        if (!existing) {
          existing = { ...pInfo, ratings: [] };
          ratingsMap.set(mp.playerId, existing);
        }
        existing.ratings.push(Number(mp.rating));
      }
    }

    const topRated = Array.from(ratingsMap.values()).map(r => {
      const avgRating = Math.round((r.ratings.reduce((a, b) => a + b, 0) / r.ratings.length) * 100) / 100;
      return {
        playerId: r.playerId,
        playerName: r.playerName,
        teamName: r.teamName,
        avgRating,
        appearances: r.ratings.length,
      };
    }).sort((a, b) => b.avgRating - a.avgRating).slice(0, 10);

    const mvpCounts = new Map<string, { playerId: string; playerName: string; teamName: string; mvps: number }>();
    const matchPlayersMap = new Map<string, MatchPlayer[]>();
    for (const mp of allMatchPlayers) {
      if (!matchPlayersMap.has(mp.matchId)) {
        matchPlayersMap.set(mp.matchId, []);
      }
      matchPlayersMap.get(mp.matchId)!.push(mp);
    }
    for (const [matchId, playersInMatch] of matchPlayersMap.entries()) {
      let maxRating = -1;
      let mvpCandidates: MatchPlayer[] = [];
      for (const mp of playersInMatch) {
        if (mp.rating !== null) {
          const r = Number(mp.rating);
          if (r > maxRating) {
            maxRating = r;
            mvpCandidates = [mp];
          } else if (r === maxRating) {
            mvpCandidates.push(mp);
          }
        }
      }
      if (maxRating >= 5.0) {
        for (const mvpMp of mvpCandidates) {
          let entry = mvpCounts.get(mvpMp.playerId);
          if (!entry) {
            const playerName = mvpMp.player?.user?.username ?? mvpMp.player?.jerseyNumber?.toString() ?? mvpMp.playerId;
            const teamName = mvpMp.team?.name ?? 'Unknown';
            entry = { playerId: mvpMp.playerId, playerName, teamName, mvps: 0 };
            mvpCounts.set(mvpMp.playerId, entry);
          }
          entry.mvps++;
        }
      }
    }
    const mostMvps = Array.from(mvpCounts.values()).sort((a, b) => b.mvps - a.mvps).slice(0, 10);

    if (sportCode === 'football') {
      const scorers = new Map<string, { playerId: string; playerName: string; teamName: string; goals: number }>();
      const assists = new Map<string, { playerId: string; playerName: string; teamName: string; assists: number }>();
      const yellowCards = new Map<string, { playerId: string; playerName: string; teamName: string; cards: number }>();
      const redCards = new Map<string, { playerId: string; playerName: string; teamName: string; cards: number }>();

      const getOrCreateTally = (
        map: Map<string, any>,
        pUserId: string,
        initialValueKey: string,
      ) => {
        let entry = map.get(pUserId);
        if (!entry) {
          const info = userUserIdMap.get(pUserId) ?? { playerId: pUserId, playerName: 'Unknown', teamName: 'Unknown' };
          entry = { ...info, [initialValueKey]: 0 };
          map.set(pUserId, entry);
        }
        return entry;
      };

      for (const m of completedMatches) {
        const events = (m.liveData as any)?.events;
        if (!Array.isArray(events)) continue;

        for (const ev of events) {
          const pUserId = ev.playerUserId;
          if (!pUserId) continue;

          if (ev.type === 'goal') {
            if (ev.goalType !== 'own_goal') {
              const scorer = getOrCreateTally(scorers, pUserId, 'goals');
              scorer.goals++;

              const assistUserId = ev.assistPlayerUserId;
              if (assistUserId) {
                const assister = getOrCreateTally(assists, assistUserId, 'assists');
                assister.assists++;
              }
            }
          } else if (ev.type === 'card') {
            if (ev.cardType === 'yellow') {
              const yc = getOrCreateTally(yellowCards, pUserId, 'cards');
              yc.cards++;
            } else if (ev.cardType === 'red' || ev.cardType === 'second_yellow') {
              const rc = getOrCreateTally(redCards, pUserId, 'cards');
              rc.cards++;
            }
          }
        }
      }

      return {
        sportCode,
        topRated,
        mostMvps,
        topScorers: Array.from(scorers.values()).sort((a, b) => b.goals - a.goals).slice(0, 10),
        topAssists: Array.from(assists.values()).sort((a, b) => b.assists - a.assists).slice(0, 10),
        mostYellowCards: Array.from(yellowCards.values()).sort((a, b) => b.cards - a.cards).slice(0, 10),
        mostRedCards: Array.from(redCards.values()).sort((a, b) => b.cards - a.cards).slice(0, 10),
      };
    }

    if (sportCode === 'cricket') {
      const runs = new Map<string, { playerId: string; playerName: string; teamName: string; runs: number; innings: number }>();
      const wickets = new Map<string, { playerId: string; playerName: string; teamName: string; wickets: number; innings: number }>();

      for (const m of completedMatches) {
        const innings = (m.liveData as any)?.inningsData;
        if (!Array.isArray(innings)) continue;

        for (const inn of innings) {
          const batStats = inn.batsmanStats || {};
          for (const username of Object.keys(batStats)) {
            const playerRuns = batStats[username]?.runs ?? 0;
            if (playerRuns > 0) {
              let entry = runs.get(username);
              if (!entry) {
                const info = userUsernameMap.get(username) ?? { playerId: username, playerName: username, teamName: 'Unknown' };
                entry = { ...info, runs: 0, innings: 0 };
                runs.set(username, entry);
              }
              entry.runs += playerRuns;
              entry.innings++;
            }
          }

          const bowlStats = inn.bowlerStats || {};
          for (const username of Object.keys(bowlStats)) {
            const playerWickets = bowlStats[username]?.wickets ?? 0;
            if (playerWickets > 0) {
              let entry = wickets.get(username);
              if (!entry) {
                const info = userUsernameMap.get(username) ?? { playerId: username, playerName: username, teamName: 'Unknown' };
                entry = { ...info, wickets: 0, innings: 0 };
                wickets.set(username, entry);
              }
              entry.wickets += playerWickets;
              entry.innings++;
            }
          }
        }
      }

      return {
        sportCode,
        topRated,
        mostMvps,
        topRuns: Array.from(runs.values()).sort((a, b) => b.runs - a.runs).slice(0, 10),
        topWickets: Array.from(wickets.values()).sort((a, b) => b.wickets - a.wickets).slice(0, 10),
      };
    }

    if (sportCode === 'badminton') {
      const ralliesWon = new Map<string, { playerId: string; playerName: string; teamName: string; ralliesWon: number }>();

      for (const m of completedMatches) {
        const rallies = (m.liveData as any)?.rallies || [];
        const matchPlayersInMatch = allMatchPlayers.filter(mp => mp.matchId === m.id);

        for (const r of rallies) {
          if (r.winnerSide === 'none') continue;

          const targetTeamId = r.winnerSide === 'home' ? m.homeTeamId : m.awayTeamId;
          const winners = matchPlayersInMatch.filter(mp => mp.teamId === targetTeamId);

          for (const w of winners) {
            let entry = ralliesWon.get(w.playerId);
            if (!entry) {
              const playerName = w.player?.user?.username ?? w.player?.jerseyNumber?.toString() ?? w.playerId;
              const teamName = w.team?.name ?? 'Unknown';
              entry = { playerId: w.playerId, playerName, teamName, ralliesWon: 0 };
              ralliesWon.set(w.playerId, entry);
            }
            entry.ralliesWon++;
          }
        }
      }

      return {
        sportCode,
        topRated,
        mostMvps,
        topRalliesWon: Array.from(ralliesWon.values()).sort((a, b) => b.ralliesWon - a.ralliesWon).slice(0, 10),
      };
    }

    return { sportCode, topRated, mostMvps };
  }

  // ─── Private Internal Helpers ─────────────────────────────────────────────

  async getCompetitionRankings(competitionId: string): Promise<Map<string, number>> {
    const rankings = new Map<string, number>();
    const comp = await this.competitionRepo.findOne({
      where: { id: competitionId },
      relations: { stages: true }
    });
    if (!comp || comp.stages.length === 0) return rankings;

    const sortedStages = [...comp.stages].sort((a, b) => a.sequence - b.sequence);
    const lastStage = sortedStages[sortedStages.length - 1];

    const matches = await this.matchRepo.find({
      where: { stageId: lastStage.id },
      relations: { homeTeam: true, awayTeam: true }
    });
    if (matches.length === 0) return rankings;

    if (lastStage.type === 'league' || lastStage.type === 'group') {
      const winPoint = lastStage.config?.winPoint ?? 3;
      const drawPoint = lastStage.config?.drawPoint ?? 1;

      const teamStats = new Map<string, { teamId: string; group?: string; pts: number; gd: number; gf: number; ga: number }>();
      for (const m of matches) {
        if (!m.homeTeamId || !m.awayTeamId) continue;
        const g = (m.config as any)?.round || 'Group Stage';

        if (!teamStats.has(m.homeTeamId)) {
          teamStats.set(m.homeTeamId, { teamId: m.homeTeamId, group: g, pts: 0, gd: 0, gf: 0, ga: 0 });
        }
        if (!teamStats.has(m.awayTeamId)) {
          teamStats.set(m.awayTeamId, { teamId: m.awayTeamId, group: g, pts: 0, gd: 0, gf: 0, ga: 0 });
        }

        const home = teamStats.get(m.homeTeamId)!;
        const away = teamStats.get(m.awayTeamId)!;

        if (m.status === 'completed') {
          const hScore = m.homeScore ?? 0;
          const aScore = m.awayScore ?? 0;

          home.gf += hScore;
          home.ga += aScore;
          away.gf += aScore;
          away.ga += hScore;

          if (hScore > aScore) {
            home.pts += winPoint;
          } else if (aScore > hScore) {
            away.pts += winPoint;
          } else {
            home.pts += drawPoint;
            away.pts += drawPoint;
          }
        }
      }

      for (const stats of teamStats.values()) {
        stats.gd = stats.gf - stats.ga;
      }

      const groups = new Map<string, any[]>();
      for (const stats of teamStats.values()) {
        const g = stats.group || 'Group Stage';
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g)!.push(stats);
      }

      for (const [groupName, statsList] of groups.entries()) {
        statsList.sort((a, b) => {
          if (b.pts !== a.pts) return b.pts - a.pts;
          if (b.gd !== a.gd) return b.gd - a.gd;
          return b.gf - a.gf;
        });
      }

      let rank = 1;
      let maxGroupSize = Math.max(...Array.from(groups.values()).map(list => list.length));

      for (let pos = 0; pos < maxGroupSize; pos++) {
        const teamsAtPos: any[] = [];
        for (const list of groups.values()) {
          if (list[pos]) teamsAtPos.push(list[pos]);
        }

        teamsAtPos.sort((a, b) => {
          if (b.pts !== a.pts) return b.pts - a.pts;
          if (b.gd !== a.gd) return b.gd - a.gd;
          return b.gf - a.gf;
        });

        for (const t of teamsAtPos) {
          rankings.set(t.teamId, rank++);
        }
      }
    } else if (lastStage.type === 'knockout' || lastStage.type === 'group_knockout') {
      const groupMatches = matches.filter((m: any) => {
        const r = (m.config as any)?.round || '';
        return r.toLowerCase().includes('group') || r.toLowerCase().includes('league');
      });
      const knockoutMatches = matches.filter((m: any) => {
        const r = (m.config as any)?.round || '';
        return !r.toLowerCase().includes('group') && !r.toLowerCase().includes('league');
      });

      const teamHighestRound = new Map<string, string>();
      const teamFinalStatus = new Map<string, 'won_final' | 'lost_final' | 'won_third' | 'lost_third' | 'lost'>();

      const allTeamIds = new Set<string>();
      for (const m of matches) {
        if (m.homeTeamId) allTeamIds.add(m.homeTeamId);
        if (m.awayTeamId) allTeamIds.add(m.awayTeamId);
      }

      const finalMatch = knockoutMatches.find((m: any) => (m.config as any)?.round?.toLowerCase() === 'final');
      if (finalMatch && finalMatch.status === 'completed') {
        const hScore = finalMatch.homeScore ?? 0;
        const aScore = finalMatch.awayScore ?? 0;
        if (hScore > aScore) {
          teamFinalStatus.set(finalMatch.homeTeamId!, 'won_final');
          teamFinalStatus.set(finalMatch.awayTeamId!, 'lost_final');
        } else if (aScore > hScore) {
          teamFinalStatus.set(finalMatch.awayTeamId!, 'won_final');
          teamFinalStatus.set(finalMatch.homeTeamId!, 'lost_final');
        }
      }

      const thirdPlaceMatch = knockoutMatches.find((m: any) => {
        const r = (m.config as any)?.round?.toLowerCase() || '';
        return r.includes('third') || r.includes('3rd') || r.includes('bronze');
      });
      if (thirdPlaceMatch && thirdPlaceMatch.status === 'completed') {
        const hScore = thirdPlaceMatch.homeScore ?? 0;
        const aScore = thirdPlaceMatch.awayScore ?? 0;
        if (hScore > aScore) {
          teamFinalStatus.set(thirdPlaceMatch.homeTeamId!, 'won_third');
          teamFinalStatus.set(thirdPlaceMatch.awayTeamId!, 'lost_third');
        } else if (aScore > hScore) {
          teamFinalStatus.set(thirdPlaceMatch.awayTeamId!, 'won_third');
          teamFinalStatus.set(thirdPlaceMatch.homeTeamId!, 'lost_third');
        }
      }

      const getRoundRankWeight = (roundName: string): number => {
        const r = roundName.toLowerCase();
        if (r === 'final') return 10;
        if (r.includes('third') || r.includes('3rd') || r.includes('bronze')) return 9;
        if (r.includes('semi')) return 8;
        if (r.includes('quarter')) return 7;
        if (r.includes('round of 16') || r.includes('1/8')) return 6;
        if (r.includes('round of 32') || r.includes('1/16')) return 5;
        return 1;
      };

      for (const m of knockoutMatches) {
        const r = (m.config as any)?.round || '';
        if (m.homeTeamId) {
          const prev = teamHighestRound.get(m.homeTeamId);
          if (!prev || getRoundRankWeight(r) > getRoundRankWeight(prev)) {
            teamHighestRound.set(m.homeTeamId, r);
          }
        }
        if (m.awayTeamId) {
          const prev = teamHighestRound.get(m.awayTeamId);
          if (!prev || getRoundRankWeight(r) > getRoundRankWeight(prev)) {
            teamHighestRound.set(m.awayTeamId, r);
          }
        }
      }

      const winner = Array.from(allTeamIds).find(id => teamFinalStatus.get(id) === 'won_final');
      const runner = Array.from(allTeamIds).find(id => teamFinalStatus.get(id) === 'lost_final');
      const third = Array.from(allTeamIds).find(id => teamFinalStatus.get(id) === 'won_third');
      const fourth = Array.from(allTeamIds).find(id => teamFinalStatus.get(id) === 'lost_third');

      if (winner) rankings.set(winner, 1);
      if (runner) rankings.set(runner, 2);
      if (third) rankings.set(third, 3);
      if (fourth) rankings.set(fourth, 4);

      const semiLosers = Array.from(allTeamIds).filter(id => {
        const hr = teamHighestRound.get(id)?.toLowerCase() || '';
        return hr.includes('semi') && id !== winner && id !== runner && id !== third && id !== fourth;
      });
      const semiPos = third ? 4 : 3;
      semiLosers.forEach(id => rankings.set(id, semiPos));

      const quarterLosers = Array.from(allTeamIds).filter(id => {
        const hr = teamHighestRound.get(id)?.toLowerCase() || '';
        return hr.includes('quarter');
      });
      quarterLosers.forEach(id => rankings.set(id, 5));

      const r16Losers = Array.from(allTeamIds).filter(id => {
        const hr = teamHighestRound.get(id)?.toLowerCase() || '';
        return hr.includes('round of 16') || hr.includes('1/8');
      });
      r16Losers.forEach(id => rankings.set(id, 9));

      const groupOnlyTeams = Array.from(allTeamIds).filter(id => !teamHighestRound.has(id));
      if (groupOnlyTeams.length > 0 && groupMatches.length > 0) {
        const winPoint = lastStage.config?.winPoint ?? 3;
        const drawPoint = lastStage.config?.drawPoint ?? 1;

        const groupStats = new Map<string, { teamId: string; pts: number; gd: number; gf: number; ga: number }>();
        for (const id of groupOnlyTeams) {
          groupStats.set(id, { teamId: id, pts: 0, gd: 0, gf: 0, ga: 0 });
        }

        for (const m of groupMatches) {
          if (!m.homeTeamId || !m.awayTeamId) continue;
          if (m.status !== 'completed') continue;

          const hStats = groupStats.get(m.homeTeamId);
          const aStats = groupStats.get(m.awayTeamId);
          const hScore = m.homeScore ?? 0;
          const aScore = m.awayScore ?? 0;

          if (hStats) {
            hStats.gf += hScore;
            hStats.ga += aScore;
            if (hScore > aScore) hStats.pts += winPoint;
            else if (hScore === aScore) hStats.pts += drawPoint;
          }
          if (aStats) {
            aStats.gf += aScore;
            aStats.ga += hScore;
            if (aScore > hScore) aStats.pts += winPoint;
            else if (hScore === aScore) aStats.pts += drawPoint;
          }
        }

        for (const stats of groupStats.values()) {
          stats.gd = stats.gf - stats.ga;
        }

        const sortedGroupOnly = Array.from(groupStats.values()).sort((a, b) => {
          if (b.pts !== a.pts) return b.pts - a.pts;
          if (b.gd !== a.gd) return b.gd - a.gd;
          return b.gf - a.gf;
        });

        const startPos = 17;
        sortedGroupOnly.forEach((s, idx) => {
          rankings.set(s.teamId, startPos + idx);
        });
      }

      if (lastStage.type === 'knockout') {
        const prevStage = sortedStages[sortedStages.indexOf(lastStage) - 1];
        if (prevStage && (prevStage.type === 'group' || prevStage.type === 'league')) {
          const prevRankings = await this.getStageRankings(prevStage);
          const groupOnlyTeamsPrev = prevRankings.filter(id => !allTeamIds.has(id));

          let nextRank = 5;
          for (const r of rankings.values()) {
            if (r >= nextRank) nextRank = r + 1;
          }

          groupOnlyTeamsPrev.forEach(id => {
            rankings.set(id, nextRank++);
          });
        }
      }
    }

    return rankings;
  }

  private async checkAndAutoCompleteCompetition(competitionId: string): Promise<void> {
    const comp = await this.competitionRepo.findOne({
      where: { id: competitionId },
      relations: { stages: true, event: true }
    });
    if (!comp || comp.stages.length === 0) return;

    const sortedStages = [...comp.stages].sort((a, b) => a.sequence - b.sequence);
    const lastStage = sortedStages[sortedStages.length - 1];

    const matches = await this.matchRepo.find({ where: { stageId: lastStage.id } });
    if (matches && matches.length > 0) {
      const allCompleted = matches.every((m: any) => m.status === 'completed');
      if (allCompleted && comp.status !== 'completed') {
        comp.status = 'completed';
        const savedComp = await this.competitionRepo.save(comp);
        const workspaceId = comp.event.workspaceId;

        const compTeams = await this.competitionTeamRepo.find({ where: { competitionId } });
        const teamIds = compTeams.map(ct => ct.teamId);
        const allCompetingPlayers = await this.workspacesService.getTeamsPlayerUserIds(teamIds);
        await this.workspacesService.sendNotificationToMany(
          allCompetingPlayers,
          NotificationType.COMPETITION_COMPLETED,
          `Competition "${savedComp.name}" has been completed!`,
          workspaceId,
          { competitionId, competitionName: savedComp.name }
        );

        try {
          const rankings = await this.getCompetitionRankings(competitionId);
          let championTeamId: string | null = null;
          let runnerUpTeamId: string | null = null;
          for (const [tId, pos] of rankings.entries()) {
            if (pos === 1) championTeamId = tId;
            if (pos === 2) runnerUpTeamId = tId;
          }

          if (championTeamId) {
            const championTeam = await this.teamRepo.findOne({ where: { id: championTeamId } });
            if (championTeam) {
              const memberIds = await this.workspacesService.getWorkspaceMemberUserIds(workspaceId);
              await this.workspacesService.sendNotificationToMany(
                memberIds,
                NotificationType.COMPETITION_CHAMPION_ANNOUNCEMENT,
                `🥇 ${championTeam.name} has won the ${savedComp.name} competition!`,
                workspaceId,
                { competitionId, competitionName: savedComp.name, championTeamId, championTeamName: championTeam.name }
              );

              const winningPlayers = await this.workspacesService.getTeamPlayerUserIds(championTeamId);
              await this.workspacesService.sendNotificationToMany(
                winningPlayers,
                NotificationType.COMPETITION_CHAMPION,
                `🥇 Congratulations! Your team ${championTeam.name} won ${savedComp.name}!`,
                workspaceId,
                { competitionId, competitionName: savedComp.name }
              );
            }
          }

          if (runnerUpTeamId) {
            const runnerUpTeam = await this.teamRepo.findOne({ where: { id: runnerUpTeamId } });
            if (runnerUpTeam) {
              const runnerUpPlayers = await this.workspacesService.getTeamPlayerUserIds(runnerUpTeamId);
              await this.workspacesService.sendNotificationToMany(
                runnerUpPlayers,
                NotificationType.COMPETITION_RUNNER_UP,
                `🥈 Great performance! Your team ${runnerUpTeam.name} finished as runner-up in ${savedComp.name}.`,
                workspaceId,
                { competitionId, competitionName: savedComp.name }
              );
            }
          }
        } catch (e) {
          // ignore rankings error
        }

        try {
          const workspace = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
          const ownerId = workspace?.ownerId ?? '';
          const bestPlayerData = await this.getCompetitionBestPlayer(workspaceId, comp.eventId, competitionId, ownerId);
          if (bestPlayerData && bestPlayerData.bestPlayer) {
            const bestPlayer = bestPlayerData.bestPlayer;
            const playerName = bestPlayer.player?.user?.username ?? 'a player';
            const teamName = bestPlayer.team?.name ?? 'their team';
            const rating = bestPlayer.rating;

            await this.workspacesService.sendNotification(
              bestPlayer.player.userId,
              NotificationType.BEST_PLAYER_OF_TOURNAMENT,
              `⭐ You've been named the Best Player of ${savedComp.name} with a rating of ${rating}!`,
              workspaceId,
              { competitionId, competitionName: savedComp.name, rating }
            );

            const memberIds = await this.workspacesService.getWorkspaceMemberUserIds(workspaceId);
            await this.workspacesService.sendNotificationToMany(
              memberIds,
              NotificationType.BEST_PLAYER_ANNOUNCEMENT,
              `⭐ ${playerName} (${teamName}) is the Best Player of ${savedComp.name}!`,
              workspaceId,
              { competitionId, competitionName: savedComp.name, playerId: bestPlayer.playerId, playerName, teamName, rating }
            );
          }
        } catch (e) {
          // ignore best player error
        }
      }
    }
  }

  private async autoRateMatchPlayers(match: Match): Promise<void> {
    const liveData = match.liveData as any;
    if (!liveData) return;

    const stage = await this.stageRepo.findOne({
      where: { id: match.stageId },
      relations: { competition: { sport: true } },
    });
    const sportCode = stage?.competition?.sport?.code ?? 'football';

    const matchPlayers = await this.matchPlayerRepo.find({
      where: { matchId: match.id },
      relations: { player: { user: true } },
    });
    if (matchPlayers.length === 0) return;

    const toSave: MatchPlayer[] = [];

    const homeScore = match.homeScore ?? 0;
    const awayScore = match.awayScore ?? 0;
    const winnerTeamId =
      homeScore > awayScore
        ? match.homeTeamId
        : awayScore > homeScore
          ? match.awayTeamId
          : null;
    const loserTeamId =
      winnerTeamId === match.homeTeamId
        ? match.awayTeamId
        : winnerTeamId === match.awayTeamId
          ? match.homeTeamId
          : null;

    if (sportCode === 'football') {
      if (!Array.isArray(liveData.events)) return;
      const playingStarters = matchPlayers.filter(mp => mp.isPlaying);
      if (playingStarters.length === 0) return;

      type PlayerTally = {
        goals: number;
        assists: number;
        ownGoals: number;
        yellowCards: number;
        redCards: number;
      };
      const tallies = new Map<string, PlayerTally>();
      for (const mp of playingStarters) {
        tallies.set(mp.playerId, { goals: 0, assists: 0, ownGoals: 0, yellowCards: 0, redCards: 0 });
      }

      for (const event of liveData.events as any[]) {
        let scorerPlayerId: string | undefined = undefined;
        let assistPlayerId: string | undefined = undefined;

        if (event.playerId) {
          scorerPlayerId = event.playerId;
        } else if (event.playerUserId) {
          scorerPlayerId = matchPlayers.find(mp => mp.player?.userId === event.playerUserId)?.playerId;
        }

        if (event.assistPlayerUserId) {
          assistPlayerId = matchPlayers.find(mp => mp.player?.userId === event.assistPlayerUserId)?.playerId;
        } else if (event.assistPlayerId) {
          assistPlayerId = event.assistPlayerId;
        }

        if (event.type === 'goal') {
          if (event.goalType === 'own_goal') {
            if (scorerPlayerId) {
              const t = tallies.get(scorerPlayerId);
              if (t) t.ownGoals++;
            }
          } else {
            if (scorerPlayerId) {
              const t = tallies.get(scorerPlayerId);
              if (t) t.goals++;
            }
            if (assistPlayerId) {
              const t = tallies.get(assistPlayerId);
              if (t) t.assists++;
            }
          }
        } else if (event.type === 'own_goal') {
          if (scorerPlayerId) {
            const t = tallies.get(scorerPlayerId);
            if (t) t.ownGoals++;
          }
        } else if (event.type === 'assist') {
          if (scorerPlayerId) {
            const t = tallies.get(scorerPlayerId);
            if (t) t.assists++;
          }
        } else if (event.type === 'card') {
          if (scorerPlayerId) {
            const t = tallies.get(scorerPlayerId);
            if (t) {
              if (event.cardType === 'yellow') {
                t.yellowCards++;
              } else if (event.cardType === 'red' || event.cardType === 'second_yellow') {
                t.redCards++;
              }
            }
          }
        } else if (event.type === 'yellow_card') {
          if (scorerPlayerId) {
            const t = tallies.get(scorerPlayerId);
            if (t) t.yellowCards++;
          }
        } else if (event.type === 'red_card') {
          if (scorerPlayerId) {
            const t = tallies.get(scorerPlayerId);
            if (t) t.redCards++;
          }
        }
      }

      const homeGoalsAgainst = awayScore;
      const awayGoalsAgainst = homeScore;

      for (const mp of playingStarters) {
        if (mp.rating !== null) continue;

        const tally = tallies.get(mp.playerId) ?? { goals: 0, assists: 0, ownGoals: 0, yellowCards: 0, redCards: 0 };
        let rating = 5.0;

        const goalBonus = mp.isGoalkeeper ? 0.3 : 0.5;
        rating += tally.goals * goalBonus;
        rating += tally.assists * 0.3;
        rating -= tally.ownGoals * 0.5;

        if (winnerTeamId && mp.teamId === winnerTeamId) {
          rating += 0.5;
        } else if (loserTeamId && mp.teamId === loserTeamId) {
          rating -= 0.3;
        }

        if (mp.isGoalkeeper) {
          const goalsConceded =
            mp.teamId === match.homeTeamId ? homeGoalsAgainst : awayGoalsAgainst;
          if (goalsConceded === 0) {
            rating += 0.5;
          }
        }

        rating -= tally.yellowCards * 0.3;
        rating -= tally.redCards * 0.8;

        mp.rating = Math.min(10.0, Math.max(5.0, Math.round(rating * 100) / 100));
        toSave.push(mp);
      }
    } else if (sportCode === 'cricket') {
      const inningsList = liveData.inningsData || [];

      for (const mp of matchPlayers) {
        if (mp.rating !== null) continue;

        const username = mp.player?.user?.username;
        if (!username) continue;

        const hasStats = inningsList.some((inn: any) => inn.batsmanStats?.[username] || inn.bowlerStats?.[username]);
        if (!mp.isPlaying && !hasStats) continue;

        let rating = 5.0;

        let batRuns = 0, batBalls = 0, batFours = 0, batSixes = 0;
        let bowledOut = false;

        let bowlOvers = 0, bowlBalls = 0, bowlRunsConceded = 0, bowlWickets = 0, bowlMaidens = 0;

        for (const inn of inningsList) {
          const bStats = inn.batsmanStats?.[username];
          if (bStats) {
            batRuns += bStats.runs ?? 0;
            batBalls += bStats.balls ?? 0;
            batFours += bStats.fours ?? 0;
            batSixes += bStats.sixes ?? 0;
          }
          const bwStats = inn.bowlerStats?.[username];
          if (bwStats) {
            bowlOvers += bwStats.overs ?? 0;
            bowlBalls += bwStats.balls ?? 0;
            bowlRunsConceded += bwStats.runsConceded ?? 0;
            bowlWickets += bwStats.wickets ?? 0;
            bowlMaidens += bwStats.maidens ?? 0;
          }
          if (inn.ballsHistory) {
            for (const ball of inn.ballsHistory) {
              if (ball.wicket && ball.striker === username && ball.wicketType !== 'Retired Hurt') {
                bowledOut = true;
              }
            }
          }
        }

        rating += batRuns * 0.05;
        rating += batFours * 0.1;
        rating += batSixes * 0.2;

        if (batBalls > 5) {
          const sr = (batRuns / batBalls) * 100;
          if (sr > 150) rating += 0.5;
          else if (sr > 120) rating += 0.3;
          else if (sr < 80) rating -= 0.3;
        }

        if (bowledOut && batRuns === 0 && batBalls > 0) {
          rating -= 0.5;
        }

        rating += bowlWickets * 0.8;
        rating += bowlMaidens * 0.5;
        rating -= bowlRunsConceded * 0.02;

        const totalOvers = bowlOvers + (bowlBalls / 6);
        if (totalOvers > 1.0) {
          const econ = bowlRunsConceded / totalOvers;
          if (econ < 6.0) rating += 0.5;
          else if (econ < 8.0) rating += 0.2;
          else if (econ > 10.0) rating -= 0.4;
        }

        if (winnerTeamId && mp.teamId === winnerTeamId) {
          rating += 0.5;
        } else if (loserTeamId && mp.teamId === loserTeamId) {
          rating -= 0.3;
        }

        mp.rating = Math.min(10.0, Math.max(5.0, Math.round(rating * 100) / 100));
        toSave.push(mp);
      }
    } else if (sportCode === 'badminton') {
      const rallies = liveData.rallies || [];
      const starters = matchPlayers.filter(mp => mp.isPlaying);

      for (const mp of starters) {
        if (mp.rating !== null) continue;

        let rating = 5.0;
        let wonRallies = 0, lostRallies = 0;

        const isHomeTeam = mp.teamId === match.homeTeamId;

        for (const r of rallies) {
          if (r.winnerSide === 'none') continue;
          if (isHomeTeam) {
            if (r.winnerSide === 'home') wonRallies++;
            else lostRallies++;
          } else {
            if (r.winnerSide === 'away') wonRallies++;
            else lostRallies++;
          }
        }

        rating += wonRallies * 0.1;
        rating -= lostRallies * 0.05;

        if (winnerTeamId && mp.teamId === winnerTeamId) {
          rating += 0.5;
        } else if (loserTeamId && mp.teamId === loserTeamId) {
          rating -= 0.3;
        }

        mp.rating = Math.min(10.0, Math.max(5.0, Math.round(rating * 100) / 100));
        toSave.push(mp);
      }
    }

    if (toSave.length > 0) {
      await this.matchPlayerRepo.save(toSave);

      const populatedSaved = await this.matchPlayerRepo.find({
        where: { id: In(toSave.map((s) => s.id)) },
        relations: { player: { user: true }, team: true },
      });

      const workspaceId = stage?.competition?.event?.workspaceId || null;

      for (const entry of populatedSaved) {
        if (entry.player?.userId && entry.rating !== null) {
          await this.workspacesService.sendNotification(
            entry.player.userId,
            NotificationType.PLAYER_RATED,
            `Your performance rating for ${match.homeTeam?.name ?? 'Home'} vs ${match.awayTeam?.name ?? 'Away'}: ${entry.rating}/10.`,
            workspaceId,
            { matchId: match.id, rating: entry.rating },
          );
        }
      }

      let maxRating = -1;
      let mvpMp: MatchPlayer | null = null;
      for (const entry of populatedSaved) {
        if (entry.rating !== null) {
          const r = Number(entry.rating);
          if (r > maxRating) {
            maxRating = r;
            mvpMp = entry;
          }
        }
      }

      if (mvpMp && maxRating >= 5.0 && mvpMp.player?.userId) {
        const playerName = mvpMp.player.user?.username ?? 'Player';
        const teamName = mvpMp.team?.name ?? 'Unknown';

        await this.workspacesService.sendNotification(
          mvpMp.player.userId,
          NotificationType.MATCH_MVP,
          `🌟 MVP! You were the highest-rated player (${maxRating}) in ${match.homeTeam?.name ?? 'Home'} vs ${match.awayTeam?.name ?? 'Away'}!`,
          workspaceId,
          { matchId: match.id, rating: maxRating },
        );

        if (workspaceId) {
          const memberIds = await this.workspacesService.getWorkspaceMemberUserIds(workspaceId);
          await this.workspacesService.sendNotificationToMany(
            memberIds,
            NotificationType.MATCH_MVP_ANNOUNCEMENT,
            `🌟 ${playerName} (${teamName}) is the Man of the Match in ${match.homeTeam?.name ?? 'Home'} vs ${match.awayTeam?.name ?? 'Away'} (rating: ${maxRating})!`,
            workspaceId,
            { matchId: match.id, playerId: mvpMp.playerId, playerName, teamName, rating: maxRating },
          );
        }
      }
    }
  }

  private async advanceGroupStageWinners(stage: CompetitionStage): Promise<void> {
    const allMatches = await this.matchRepo.find({
      where: { stageId: stage.id },
      order: { id: 'ASC', createdAt: 'ASC' }
    });

    const groupMatches = allMatches.filter(m => {
      const r = (m.config as any)?.round || '';
      return r.toLowerCase().includes('group') || r.toLowerCase().includes('league');
    });

    const knockoutMatches = allMatches.filter(m => {
      const r = (m.config as any)?.round || '';
      return !r.toLowerCase().includes('group') && !r.toLowerCase().includes('league');
    });

    if (groupMatches.length === 0 || knockoutMatches.length === 0) return;

    const allGroupMatchesCompleted = groupMatches.every(m => m.status === 'completed');
    if (!allGroupMatchesCompleted) return;

    const winPoint = stage.config?.winPoint ?? 3;
    const drawPoint = stage.config?.drawPoint ?? 1;

    const roundTeams = new Map<string, Set<string>>();
    for (const m of groupMatches) {
      const r = (m.config as any)?.round || 'Group Stage';
      if (!roundTeams.has(r)) {
        roundTeams.set(r, new Set());
      }
      if (m.homeTeamId) roundTeams.get(r)!.add(m.homeTeamId);
      if (m.awayTeamId) roundTeams.get(r)!.add(m.awayTeamId);
    }

    const standings = new Map<string, { teamId: string; pts: number; gd: number; gf: number }>();
    for (const [r, teams] of roundTeams.entries()) {
      for (const teamId of teams) {
        standings.set(`${r}-${teamId}`, { teamId, pts: 0, gd: 0, gf: 0 });
      }
    }

    for (const m of groupMatches) {
      const r = (m.config as any)?.round || 'Group Stage';
      if (!m.homeTeamId || !m.awayTeamId) continue;

      const homeKey = `${r}-${m.homeTeamId}`;
      const awayKey = `${r}-${m.awayTeamId}`;

      const homeStats = standings.get(homeKey);
      const awayStats = standings.get(awayKey);
      if (!homeStats || !awayStats) continue;

      const hScore = m.homeScore ?? 0;
      const aScore = m.awayScore ?? 0;

      homeStats.gf += hScore;
      awayStats.gf += aScore;
      homeStats.gd += (hScore - aScore);
      awayStats.gd += (aScore - hScore);

      if (hScore > aScore) {
        homeStats.pts += winPoint;
      } else if (aScore > hScore) {
        awayStats.pts += winPoint;
      } else {
        homeStats.pts += drawPoint;
        awayStats.pts += drawPoint;
      }
    }

    const roundRankings = new Map<string, string[]>();
    for (const [r, teams] of roundTeams.entries()) {
      const sorted = Array.from(teams).sort((a, b) => {
        const statsA = standings.get(`${r}-${a}`)!;
        const statsB = standings.get(`${r}-${b}`)!;
        if (statsB.pts !== statsA.pts) return statsB.pts - statsA.pts;
        if (statsB.gd !== statsA.gd) return statsB.gd - statsA.gd;
        return statsB.gf - statsA.gf;
      });
      roundRankings.set(r, sorted);
    }

    const koRoundCounts: { [round: string]: number } = {};
    for (const m of knockoutMatches) {
      const rName = (m.config as any)?.round;
      if (!rName) continue;
      if (rName.toLowerCase().includes('third') || rName.toLowerCase().includes('3rd')) continue;
      const isLeg1OrNone = (m.config as any)?.leg === undefined || (m.config as any)?.leg === 1;
      if (isLeg1OrNone) {
        koRoundCounts[rName] = (koRoundCounts[rName] || 0) + 1;
      }
    }
    const sortedKoRounds = Object.keys(koRoundCounts).sort((a, b) => koRoundCounts[b] - koRoundCounts[a]);
    if (sortedKoRounds.length === 0) return;

    const firstKoRoundName = sortedKoRounds[0];
    const firstKoRoundMatches = knockoutMatches.filter(m =>
      (m.config as any)?.round === firstKoRoundName &&
      ((m.config as any)?.leg === undefined || (m.config as any)?.leg === 1)
    );

    const isSingleGroup = stage.config?.groupKnockoutSubtype === 'single_group';
    const advancingType = stage.config?.advancingType || 'winner';
    const groupsCount = stage.config?.groupsCount ?? 2;
    const twoLegged = (stage.config as any)?.twoLegged || (stage.config as any)?.legs === 2;

    const promotedTeams: { home: string; away: string }[] = [];

    if (isSingleGroup) {
      const sortedTeams = roundRankings.get('Group Stage') || [];
      if (firstKoRoundMatches.length === 1) {
        if (sortedTeams.length >= 2) {
          promotedTeams.push({ home: sortedTeams[0], away: sortedTeams[1] });
        }
        if (sortedTeams.length >= 4) {
          const thirdPlaceLeg1Match = knockoutMatches.find(m =>
            (m.config as any)?.round === 'Third Place Match' &&
            ((m.config as any)?.leg === undefined || (m.config as any)?.leg === 1)
          );
          if (thirdPlaceLeg1Match) {
            thirdPlaceLeg1Match.homeTeamId = sortedTeams[2];
            thirdPlaceLeg1Match.awayTeamId = sortedTeams[3];
            await this.matchRepo.save(thirdPlaceLeg1Match);

            if (twoLegged) {
              const thirdPlaceLeg2Match = knockoutMatches.find(m =>
                (m.config as any)?.round === 'Third Place Match' &&
                (m.config as any)?.leg === 2
              );
              if (thirdPlaceLeg2Match) {
                thirdPlaceLeg2Match.homeTeamId = sortedTeams[3];
                thirdPlaceLeg2Match.awayTeamId = sortedTeams[2];
                await this.matchRepo.save(thirdPlaceLeg2Match);
              }
            }
          }
        }
      } else if (firstKoRoundMatches.length === 2) {
        if (sortedTeams.length >= 4) {
          promotedTeams.push({ home: sortedTeams[0], away: sortedTeams[3] });
          promotedTeams.push({ home: sortedTeams[1], away: sortedTeams[2] });
        }
      }
    } else {
      const getWinner = (gIdx: number) => {
        const groupChar = String.fromCharCode(65 + gIdx);
        const sorted = roundRankings.get(`Group ${groupChar}`) || [];
        return sorted[0] || null;
      };
      const getRunner = (gIdx: number) => {
        const groupChar = String.fromCharCode(65 + gIdx);
        const sorted = roundRankings.get(`Group ${groupChar}`) || [];
        return sorted[1] || null;
      };

      if (groupsCount === 2) {
        if (advancingType === 'winner') {
          const wA = getWinner(0);
          const wB = getWinner(1);
          if (wA && wB) {
            promotedTeams.push({ home: wA, away: wB });
          }
          const rA = getRunner(0);
          const rB = getRunner(1);
          if (rA && rB) {
            const thirdPlaceLeg1Match = knockoutMatches.find(m =>
              (m.config as any)?.round === 'Third Place Match' &&
              ((m.config as any)?.leg === undefined || (m.config as any)?.leg === 1)
            );
            if (thirdPlaceLeg1Match) {
              thirdPlaceLeg1Match.homeTeamId = rA;
              thirdPlaceLeg1Match.awayTeamId = rB;
              await this.matchRepo.save(thirdPlaceLeg1Match);

              if (twoLegged) {
                const thirdPlaceLeg2Match = knockoutMatches.find(m =>
                  (m.config as any)?.round === 'Third Place Match' &&
                  (m.config as any)?.leg === 2
                );
                if (thirdPlaceLeg2Match) {
                  thirdPlaceLeg2Match.homeTeamId = rB;
                  thirdPlaceLeg2Match.awayTeamId = rA;
                  await this.matchRepo.save(thirdPlaceLeg2Match);
                }
              }
            }
          }
        } else if (advancingType === 'winner_and_runner') {
          const wA = getWinner(0);
          const rA = getRunner(0);
          const wB = getWinner(1);
          const rB = getRunner(1);
          if (wA && rB) promotedTeams.push({ home: wA, away: rB });
          if (wB && rA) promotedTeams.push({ home: wB, away: rA });
        }
      } else if (groupsCount === 4) {
        if (advancingType === 'winner') {
          const wA = getWinner(0);
          const wB = getWinner(1);
          const wC = getWinner(2);
          const wD = getWinner(3);
          if (wA && wB) promotedTeams.push({ home: wA, away: wB });
          if (wC && wD) promotedTeams.push({ home: wC, away: wD });
        } else if (advancingType === 'winner_and_runner') {
          const wA = getWinner(0);
          const rA = getRunner(0);
          const wB = getWinner(1);
          const rB = getRunner(1);
          const wC = getWinner(2);
          const rC = getRunner(2);
          const wD = getWinner(3);
          const rD = getRunner(3);
          if (wA && rB) promotedTeams.push({ home: wA, away: rB });
          if (wB && rA) promotedTeams.push({ home: wB, away: rA });
          if (wC && rD) promotedTeams.push({ home: wC, away: rD });
          if (wD && rC) promotedTeams.push({ home: wD, away: rC });
        }
      }
    }

    for (let i = 0; i < promotedTeams.length; i++) {
      const targetMatch = firstKoRoundMatches[i];
      if (!targetMatch) continue;

      targetMatch.homeTeamId = promotedTeams[i].home;
      targetMatch.awayTeamId = promotedTeams[i].away;
      await this.matchRepo.save(targetMatch);

      if (twoLegged) {
        const nextRoundLeg2Matches = knockoutMatches.filter(m =>
          (m.config as any)?.round === firstKoRoundName &&
          (m.config as any)?.leg === 2
        );
        const targetLeg2Match = nextRoundLeg2Matches[i];
        if (targetLeg2Match) {
          targetLeg2Match.homeTeamId = promotedTeams[i].away;
          targetLeg2Match.awayTeamId = promotedTeams[i].home;
          await this.matchRepo.save(targetLeg2Match);
        }
      }
    }

    try {
      const comp = await this.competitionRepo.findOne({
        where: { id: stage.competitionId },
        relations: { event: true }
      });
      if (comp) {
        const workspaceId = comp.event?.workspaceId || null;
        const qualifiedTeamIds = [...new Set(promotedTeams.flatMap((p) => [p.home, p.away]))];

        for (const tId of qualifiedTeamIds) {
          const team = await this.teamRepo.findOne({ where: { id: tId } });
          if (team) {
            const players = await this.workspacesService.getTeamPlayerUserIds(tId);
            await this.workspacesService.sendNotificationToMany(
              players,
              NotificationType.TEAM_QUALIFIED_FROM_GROUP,
              `🎯 ${team.name} has qualified from the group stage in ${comp.name}!`,
              workspaceId,
              { competitionId: comp.id, competitionName: comp.name },
            );
          }
        }

        const allCompTeams = await this.competitionTeamRepo.find({ where: { competitionId: stage.competitionId } });
        const enrolledTeamIds = allCompTeams.map((ct) => ct.teamId);
        const eliminatedTeamIds = enrolledTeamIds.filter((id) => !qualifiedTeamIds.includes(id));

        for (const tId of eliminatedTeamIds) {
          const team = await this.teamRepo.findOne({ where: { id: tId } });
          if (team) {
            const players = await this.workspacesService.getTeamPlayerUserIds(tId);
            await this.workspacesService.sendNotificationToMany(
              players,
              NotificationType.TEAM_ELIMINATED,
              `💔 ${team.name} has been eliminated from ${comp.name}.`,
              workspaceId,
              { competitionId: comp.id, competitionName: comp.name },
            );
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  private async getStageRankings(stage: CompetitionStage): Promise<string[]> {
    const matches = await this.matchRepo.find({
      where: { stageId: stage.id },
    });

    const winPoint = stage.config?.winPoint ?? 3;
    const drawPoint = stage.config?.drawPoint ?? 1;

    const teamIds = new Set<string>();
    for (const m of matches) {
      if (m.homeTeamId) teamIds.add(m.homeTeamId);
      if (m.awayTeamId) teamIds.add(m.awayTeamId);
    }

    const standings = new Map<string, { teamId: string; pts: number; gd: number; gf: number }>();
    for (const teamId of teamIds) {
      standings.set(teamId, { teamId, pts: 0, gd: 0, gf: 0 });
    }

    for (const m of matches) {
      if (m.status !== 'completed' || !m.homeTeamId || !m.awayTeamId) continue;

      const homeStats = standings.get(m.homeTeamId);
      const awayStats = standings.get(m.awayTeamId);
      if (!homeStats || !awayStats) continue;

      const hScore = m.homeScore ?? 0;
      const aScore = m.awayScore ?? 0;

      homeStats.gf += hScore;
      awayStats.gf += aScore;
      homeStats.gd += (hScore - aScore);
      awayStats.gd += (aScore - hScore);

      if (hScore > aScore) {
        homeStats.pts += winPoint;
      } else if (aScore > hScore) {
        awayStats.pts += winPoint;
      } else {
        homeStats.pts += drawPoint;
        awayStats.pts += drawPoint;
      }
    }

    return Array.from(teamIds).sort((a, b) => {
      const statsA = standings.get(a)!;
      const statsB = standings.get(b)!;
      if (statsB.pts !== statsA.pts) return statsB.pts - statsA.pts;
      if (statsB.gd !== statsA.gd) return statsB.gd - statsA.gd;
      return statsB.gf - statsA.gf;
    });
  }

  private async generateKnockoutStageMatches(stage: CompetitionStage, teamIds: string[]): Promise<void> {
    const twoLegged = stage.config?.twoLegged || stage.config?.legs === 2;
    const prevStages = await this.stageRepo.find({
      where: { competitionId: stage.competitionId },
      order: { sequence: 'ASC', createdAt: 'ASC' },
    });
    const prevStage = prevStages[prevStages.indexOf(stage) - 1];

    let koTeamsCount = teamIds.length;
    if (prevStage) {
      if (prevStage.type === 'group' || prevStage.type === 'league') {
        koTeamsCount = prevStage.config?.advancingCount ?? (prevStage.config?.groupsCount ? prevStage.config.groupsCount * 2 : 4);
      }
    }

    const bracketSize = Math.pow(2, Math.ceil(Math.log2(Math.max(koTeamsCount, 2))));
    const advancingTeams = teamIds.slice(0, bracketSize);

    const padded: (string | null)[] = [...advancingTeams, ...Array(bracketSize - advancingTeams.length).fill(null)];

    const fixtures: Array<{ homeTeamId: string | null; awayTeamId: string | null; config: any }> = [];

    const roundLabel = bracketSize === 2 ? 'Final' : bracketSize === 4 ? 'Semi-Final' : bracketSize === 8 ? 'Quarter-Final' : `Round of ${bracketSize}`;

    const firstRoundPairs: [string | null, string | null][] = [];
    const half = bracketSize / 2;
    for (let i = 0; i < half; i++) {
      firstRoundPairs.push([padded[i], padded[bracketSize - 1 - i]]);
    }

    for (const pair of firstRoundPairs) {
      const home = pair[0];
      const away = pair[1];
      if (home === null && away === null) continue;
      fixtures.push({
        homeTeamId: home,
        awayTeamId: away,
        config: twoLegged ? { round: roundLabel, leg: 1 } : { round: roundLabel },
      });
      if (twoLegged && home !== null && away !== null) {
        fixtures.push({
          homeTeamId: away,
          awayTeamId: home,
          config: { round: roundLabel, leg: 2 },
        });
      }
    }

    let remainingTeams = bracketSize / 2;
    while (remainingTeams >= 2) {
      const subRoundLabel = remainingTeams === 2 ? 'Final' : remainingTeams === 4 ? 'Semi-Final' : remainingTeams === 8 ? 'Quarter-Final' : `Round of ${remainingTeams * 2}`;
      const matchesInRound = remainingTeams / 2;
      for (let m = 0; m < matchesInRound; m++) {
        fixtures.push({
          homeTeamId: null,
          awayTeamId: null,
          config: twoLegged ? { round: subRoundLabel, leg: 1 } : { round: subRoundLabel },
        });
        if (twoLegged) {
          fixtures.push({
            homeTeamId: null,
            awayTeamId: null,
            config: { round: subRoundLabel, leg: 2 },
          });
        }
      }
      if (remainingTeams === 2) {
        const home3rd = bracketSize === 2 && advancingTeams.length >= 4 ? advancingTeams[2] : null;
        const away3rd = bracketSize === 2 && advancingTeams.length >= 4 ? advancingTeams[3] : null;
        fixtures.push({
          homeTeamId: home3rd,
          awayTeamId: away3rd,
          config: twoLegged ? { round: 'Third Place Match', leg: 1 } : { round: 'Third Place Match' },
        });
        if (twoLegged) {
          fixtures.push({
            homeTeamId: away3rd,
            awayTeamId: home3rd,
            config: { round: 'Third Place Match', leg: 2 },
          });
        }
      }
      remainingTeams = remainingTeams / 2;
    }

    for (const f of fixtures) {
      const m = this.matchRepo.create({
        stageId: stage.id,
        homeTeamId: f.homeTeamId,
        awayTeamId: f.awayTeamId,
        status: 'scheduled',
        config: f.config,
        liveData: {},
      });
      await this.matchRepo.save(m);
    }
  }

  private async advanceTeamsBetweenStages(currentStage: CompetitionStage): Promise<void> {
    const stages = await this.stageRepo.find({
      where: { competitionId: currentStage.competitionId },
      order: { sequence: 'ASC', createdAt: 'ASC' },
    });

    const currIdx = stages.findIndex((s) => s.id === currentStage.id);
    if (currIdx === -1 || currIdx === stages.length - 1) return;

    const nextStage = stages[currIdx + 1];
    if (nextStage.type !== 'knockout') return;

    const currentMatches = await this.matchRepo.find({
      where: { stageId: currentStage.id },
    });
    if (currentMatches.length === 0) return;

    const allCompleted = currentMatches.every((m) => m.status === 'completed');
    if (!allCompleted) return;

    const sortedTeams = await this.getStageRankings(currentStage);
    if (sortedTeams.length === 0) return;

    let nextMatches = await this.matchRepo.find({
      where: { stageId: nextStage.id },
      order: { id: 'ASC', createdAt: 'ASC' },
    });

    if (nextMatches.length === 0) {
      await this.generateKnockoutStageMatches(nextStage, sortedTeams);
      nextMatches = await this.matchRepo.find({
        where: { stageId: nextStage.id },
        order: { id: 'ASC', createdAt: 'ASC' },
      });
    }

    if (nextMatches.length === 0) return;

    const roundCounts: { [round: string]: number } = {};
    for (const m of nextMatches) {
      const rName = (m.config as any)?.round;
      if (!rName) continue;
      if (rName.toLowerCase().includes('third') || rName.toLowerCase().includes('3rd')) continue;
      const isLeg1OrNone = (m.config as any)?.leg === undefined || (m.config as any)?.leg === 1;
      if (isLeg1OrNone) {
        roundCounts[rName] = (roundCounts[rName] || 0) + 1;
      }
    }

    const sortedRounds = Object.keys(roundCounts).sort((a, b) => roundCounts[b] - roundCounts[a]);
    if (sortedRounds.length === 0) return;

    const firstKoRoundName = sortedRounds[0];
    const firstKoRoundMatches = nextMatches.filter(m =>
      (m.config as any)?.round === firstKoRoundName &&
      ((m.config as any)?.leg === undefined || (m.config as any)?.leg === 1)
    );

    const matchesCount = firstKoRoundMatches.length;
    const teamsCountNeeded = matchesCount * 2;

    const advancingTeams = sortedTeams.slice(0, teamsCountNeeded);

    const twoLegged = (nextStage.config as any)?.twoLegged || (nextStage.config as any)?.legs === 2;

    for (let i = 0; i < matchesCount; i++) {
      const targetMatch = firstKoRoundMatches[i];
      if (!targetMatch) continue;

      const homeTeam = advancingTeams[i] || null;
      const awayTeam = advancingTeams[teamsCountNeeded - 1 - i] || null;

      targetMatch.homeTeamId = homeTeam;
      targetMatch.awayTeamId = awayTeam;
      await this.matchRepo.save(targetMatch);

      if (twoLegged) {
        const nextRoundLeg2Matches = nextMatches.filter(m =>
          (m.config as any)?.round === firstKoRoundName &&
          (m.config as any)?.leg === 2
        );
        const targetLeg2Match = nextRoundLeg2Matches[i];
        if (targetLeg2Match) {
          targetLeg2Match.homeTeamId = awayTeam;
          targetLeg2Match.awayTeamId = homeTeam;
          await this.matchRepo.save(targetLeg2Match);
        }
      }
    }

    if (matchesCount === 1 && sortedTeams.length >= 4) {
      const thirdPlaceMatches = nextMatches.filter(m => {
        const r = (m.config as any)?.round || '';
        const rLower = r.toLowerCase();
        return rLower.includes('third') || rLower.includes('3rd') || rLower.includes('loser');
      });

      const thirdPlaceLeg1Matches = thirdPlaceMatches.filter(m =>
        (m.config as any)?.leg === undefined || (m.config as any)?.leg === 1
      );

      for (let i = 0; i < thirdPlaceLeg1Matches.length; i++) {
        const targetMatch = thirdPlaceLeg1Matches[i];
        if (!targetMatch) continue;

        const homeTeam = sortedTeams[2] || null;
        const awayTeam = sortedTeams[3] || null;

        targetMatch.homeTeamId = homeTeam;
        targetMatch.awayTeamId = awayTeam;
        await this.matchRepo.save(targetMatch);

        if (twoLegged) {
          const nextRoundLeg2Matches = thirdPlaceMatches.filter(m =>
            (m.config as any)?.leg === 2
          );
          const targetLeg2Match = nextRoundLeg2Matches[i];
          if (targetLeg2Match) {
            targetLeg2Match.homeTeamId = awayTeam;
            targetLeg2Match.awayTeamId = homeTeam;
            await this.matchRepo.save(targetLeg2Match);
          }
        }
      }
    }
  }

  private async advanceKnockoutWinner(completedMatch: Match, stage: CompetitionStage): Promise<void> {
    const roundName = (completedMatch.config as any)?.round;
    if (!roundName || roundName.toLowerCase() === 'final' || roundName.toLowerCase().includes('third') || roundName.toLowerCase().includes('3rd')) return;

    // Ignore group and league stage matches for knockout advancement
    const roundLower = roundName.toLowerCase();
    if (roundLower.includes('group') || roundLower.includes('league')) return;

    // Fetch all matches in this stage
    const allMatches = await this.matchRepo.find({
      where: { stageId: stage.id },
      order: { id: 'ASC', createdAt: 'ASC' }
    });

    // Group unique matches per round (excluding Third Place Match)
    const roundCounts: { [round: string]: number } = {};
    for (const m of allMatches) {
      const rName = (m.config as any)?.round;
      if (!rName) continue;
      if (rName.toLowerCase().includes('third') || rName.toLowerCase().includes('3rd')) continue;
      const isLeg1OrNone = (m.config as any)?.leg === undefined || (m.config as any)?.leg === 1;
      if (isLeg1OrNone) {
        roundCounts[rName] = (roundCounts[rName] || 0) + 1;
      }
    }

    const sortedRounds = Object.keys(roundCounts).sort((a, b) => roundCounts[b] - roundCounts[a]);
    const currRoundIdx = sortedRounds.indexOf(roundName);
    if (currRoundIdx === -1 || currRoundIdx === sortedRounds.length - 1) return;

    const nextRoundName = sortedRounds[currRoundIdx + 1];

    // Find winner of the completed match/tie
    let winnerId: string | null = null;
    const homeScore = completedMatch.homeScore ?? 0;
    const awayScore = completedMatch.awayScore ?? 0;

    if ((completedMatch.config as any)?.leg === 1) {
      // Leg 1 complete: wait for leg 2 to finish
      return;
    }

    if ((completedMatch.config as any)?.leg === 2) {
      // Aggregate two legs
      const leg1 = allMatches.find(m =>
        (m.config as any)?.round === roundName &&
        (m.config as any)?.leg === 1 &&
        m.homeTeamId === completedMatch.awayTeamId &&
        m.awayTeamId === completedMatch.homeTeamId
      );
      if (leg1) {
        const teamAScore = (leg1.homeScore ?? 0) + (completedMatch.awayScore ?? 0);
        const teamBScore = (leg1.awayScore ?? 0) + (completedMatch.homeScore ?? 0);
        if (teamAScore > teamBScore) {
          winnerId = leg1.homeTeamId;
        } else if (teamBScore > teamAScore) {
          winnerId = leg1.awayTeamId;
        } else {
          // Tie-breaker: check shootout score or default to leg 2 winner
          const live = completedMatch.liveData || {};
          const shHome = live.shootoutHomeScore ?? 0;
          const shAway = live.shootoutAwayScore ?? 0;
          if (shHome > shAway) {
            winnerId = completedMatch.homeTeamId;
          } else if (shAway > shHome) {
            winnerId = completedMatch.awayTeamId;
          } else {
            winnerId = homeScore > awayScore ? completedMatch.homeTeamId : completedMatch.awayTeamId;
          }
        }
      } else {
        const live = completedMatch.liveData || {};
        const shHome = live.shootoutHomeScore ?? 0;
        const shAway = live.shootoutAwayScore ?? 0;
        if (shHome > shAway) {
          winnerId = completedMatch.homeTeamId;
        } else if (shAway > shHome) {
          winnerId = completedMatch.awayTeamId;
        } else {
          winnerId = homeScore > awayScore ? completedMatch.homeTeamId : completedMatch.awayTeamId;
        }
      }
    } else {
      // Single leg
      const live = completedMatch.liveData || {};
      const result = live.result;
      if (result === 'Home Win' || result === 'Walkover (Home Win)') {
        winnerId = completedMatch.homeTeamId;
      } else if (result === 'Away Win' || result === 'Walkover (Away Win)') {
        winnerId = completedMatch.awayTeamId;
      } else if (homeScore > awayScore) {
        winnerId = completedMatch.homeTeamId;
      } else if (awayScore > homeScore) {
        winnerId = completedMatch.awayTeamId;
      } else {
        // Check shootout
        const shHome = live.shootoutHomeScore ?? 0;
        const shAway = live.shootoutAwayScore ?? 0;
        if (shHome > shAway) {
          winnerId = completedMatch.homeTeamId;
        } else if (shAway > shHome) {
          winnerId = completedMatch.awayTeamId;
        }
      }
    }

    if (!winnerId) return;

    // Find index of this match in the current round
    const currRoundMatches = allMatches.filter(m =>
      (m.config as any)?.round === roundName &&
      ((m.config as any)?.leg === undefined || (m.config as any)?.leg === 1)
    );
    const matchIndex = currRoundMatches.findIndex(m =>
      m.id === completedMatch.id ||
      ((completedMatch.config as any)?.leg === 2 && m.homeTeamId === completedMatch.awayTeamId && m.awayTeamId === completedMatch.homeTeamId)
    );
    if (matchIndex === -1) return;

    // Next round details
    const nextRoundMatches = allMatches.filter(m =>
      (m.config as any)?.round === nextRoundName &&
      ((m.config as any)?.leg === undefined || (m.config as any)?.leg === 1)
    );

    const nextMatchIndex = Math.floor(matchIndex / 2);
    const targetLeg1Match = nextRoundMatches[nextMatchIndex];
    if (!targetLeg1Match) return;

    const isHomeSlot = matchIndex % 2 === 0;

    // Update Leg 1 match
    if (isHomeSlot) {
      targetLeg1Match.homeTeamId = winnerId;
    } else {
      targetLeg1Match.awayTeamId = winnerId;
    }
    await this.matchRepo.save(targetLeg1Match);

    // If next round is two-legged, also update Leg 2 match with swapped roles
    const twoLegged = (stage.config as any)?.twoLegged || (stage.config as any)?.legs === 2;
    if (twoLegged) {
      const nextRoundLeg2Matches = allMatches.filter(m =>
        (m.config as any)?.round === nextRoundName &&
        (m.config as any)?.leg === 2
      );
      const targetLeg2MatchSec = nextRoundLeg2Matches[nextMatchIndex];
      if (targetLeg2MatchSec) {
        if (isHomeSlot) {
          targetLeg2MatchSec.awayTeamId = winnerId;
        } else {
          targetLeg2MatchSec.homeTeamId = winnerId;
        }
        await this.matchRepo.save(targetLeg2MatchSec);
      }
    }

    // Place loser in the Third Place Match if current round is Semi-Final
    let loserId: string | null = null;
    if (completedMatch.homeTeamId === winnerId) {
      loserId = completedMatch.awayTeamId;
    } else {
      loserId = completedMatch.homeTeamId;
    }

    if (loserId && roundName.toLowerCase() === 'semi-final') {
      const thirdPlaceMatches = allMatches.filter(m =>
        (m.config as any)?.round === 'Third Place Match' &&
        ((m.config as any)?.leg === undefined || (m.config as any)?.leg === 1)
      );
      const targetThirdPlaceMatch = thirdPlaceMatches[0];
      if (targetThirdPlaceMatch) {
        if (isHomeSlot) {
          targetThirdPlaceMatch.homeTeamId = loserId;
        } else {
          targetThirdPlaceMatch.awayTeamId = loserId;
        }
        await this.matchRepo.save(targetThirdPlaceMatch);

        if (twoLegged) {
          const thirdPlaceLeg2Matches = allMatches.filter(m =>
            (m.config as any)?.round === 'Third Place Match' &&
            (m.config as any)?.leg === 2
          );
          const targetThirdPlaceLeg2Match = thirdPlaceLeg2Matches[0];
          if (targetThirdPlaceLeg2Match) {
            if (isHomeSlot) {
              targetThirdPlaceLeg2Match.awayTeamId = loserId;
            } else {
              targetThirdPlaceLeg2Match.homeTeamId = loserId;
            }
            await this.matchRepo.save(targetThirdPlaceLeg2Match);
          }
        }
      }
    }

    // 9.1 & 9.2 — Team advanced & eliminated notifications
    try {
      const comp = await this.competitionRepo.findOne({
        where: { id: stage.competitionId },
        relations: { event: true }
      });
      if (comp) {
        const workspaceId = comp.event?.workspaceId || null;
        if (winnerId) {
          const winnerTeam = await this.teamRepo.findOne({ where: { id: winnerId } });
          const winningPlayers = await this.workspacesService.getTeamPlayerUserIds(winnerId);
          await this.workspacesService.sendNotificationToMany(
            winningPlayers,
            NotificationType.TEAM_ADVANCED,
            `🎯 ${winnerTeam?.name ?? 'Your team'} has advanced to the ${nextRoundName} in ${comp.name}!`,
            workspaceId,
            { competitionId: comp.id, competitionName: comp.name, nextRound: nextRoundName },
          );
        }
        if (loserId) {
          const loserTeam = await this.teamRepo.findOne({ where: { id: loserId } });
          const losingPlayers = await this.workspacesService.getTeamPlayerUserIds(loserId);
          await this.workspacesService.sendNotificationToMany(
            losingPlayers,
            NotificationType.TEAM_ELIMINATED,
            `💔 ${loserTeam?.name ?? 'Your team'} has been eliminated from ${comp.name}.`,
            workspaceId,
            { competitionId: comp.id, competitionName: comp.name },
          );
        }
      }
    } catch (e) {
      // ignore silently to prevent blocking knockout advancement
    }
  }
}
