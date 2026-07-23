import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Competition } from '../../workspaces/entities/competition.entity';
import { CompetitionStage } from '../../workspaces/entities/competition-stage.entity';
import { Match } from '../../workspaces/entities/match.entity';
import { CompetitionTeam } from '../../workspaces/entities/competition-team.entity';
import { Event } from '../../workspaces/entities/event.entity';
import { WorkspacesService } from '../../workspaces/workspaces.service';
import { NotificationType } from '../../workspaces/entities/notification.entity';

@Injectable()
export class FixturesGeneratorService {
  constructor(
    @InjectRepository(Competition)
    private readonly competitionRepo: Repository<Competition>,
    @InjectRepository(CompetitionStage)
    private readonly stageRepo: Repository<CompetitionStage>,
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,
    @InjectRepository(CompetitionTeam)
    private readonly competitionTeamRepo: Repository<CompetitionTeam>,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    private readonly workspacesService: WorkspacesService,
  ) {}

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
}
