import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Competition } from '../../workspaces/entities/competition.entity';
import { CompetitionStage } from '../../workspaces/entities/competition-stage.entity';
import { Match } from '../../workspaces/entities/match.entity';
import { CompetitionTeam } from '../../workspaces/entities/competition-team.entity';
import { Team } from '../../workspaces/entities/team.entity';
import { Workspace } from '../../workspaces/entities/workspace.entity';
import { MatchPlayer } from '../../workspaces/entities/match-player.entity';
import { WorkspacesService } from '../../workspaces/workspaces.service';
import { NotificationType } from '../../workspaces/entities/notification.entity';
import { StatisticsRatingsService } from './statistics-ratings.service';

@Injectable()
export class BracketAdvancementService {
  constructor(
    @InjectRepository(Competition)
    private readonly competitionRepo: Repository<Competition>,
    @InjectRepository(CompetitionStage)
    private readonly stageRepo: Repository<CompetitionStage>,
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,
    @InjectRepository(CompetitionTeam)
    private readonly competitionTeamRepo: Repository<CompetitionTeam>,
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(MatchPlayer)
    private readonly matchPlayerRepo: Repository<MatchPlayer>,
    private readonly workspacesService: WorkspacesService,
    private readonly statisticsRatingsService: StatisticsRatingsService,
  ) {}

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

  async checkAndAutoCompleteCompetition(competitionId: string): Promise<void> {
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
          const bestPlayerData = await this.statisticsRatingsService.getCompetitionBestPlayer(workspaceId, comp.eventId, competitionId, ownerId);
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

  async advanceGroupStageWinners(stage: CompetitionStage): Promise<void> {
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

  async getStageRankings(stage: CompetitionStage): Promise<string[]> {
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

  async generateKnockoutStageMatches(stage: CompetitionStage, teamIds: string[]): Promise<void> {
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

  async advanceTeamsBetweenStages(currentStage: CompetitionStage): Promise<void> {
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

  async advanceKnockoutWinner(completedMatch: Match, stage: CompetitionStage): Promise<void> {
    const roundName = (completedMatch.config as any)?.round;
    if (!roundName || roundName.toLowerCase() === 'final' || roundName.toLowerCase().includes('third') || roundName.toLowerCase().includes('3rd')) return;

    const roundLower = roundName.toLowerCase();
    if (roundLower.includes('group') || roundLower.includes('league')) return;

    const allMatches = await this.matchRepo.find({
      where: { stageId: stage.id },
      order: { id: 'ASC', createdAt: 'ASC' }
    });

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

    let winnerId: string | null = null;
    const homeScore = completedMatch.homeScore ?? 0;
    const awayScore = completedMatch.awayScore ?? 0;

    if ((completedMatch.config as any)?.leg === 1) {
      return;
    }

    if ((completedMatch.config as any)?.leg === 2) {
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

    const currRoundMatches = allMatches.filter(m =>
      (m.config as any)?.round === roundName &&
      ((m.config as any)?.leg === undefined || (m.config as any)?.leg === 1)
    );
    const matchIndex = currRoundMatches.findIndex(m =>
      m.id === completedMatch.id ||
      ((completedMatch.config as any)?.leg === 2 && m.homeTeamId === completedMatch.awayTeamId && m.awayTeamId === completedMatch.homeTeamId)
    );
    if (matchIndex === -1) return;

    const nextRoundMatches = allMatches.filter(m =>
      (m.config as any)?.round === nextRoundName &&
      ((m.config as any)?.leg === undefined || (m.config as any)?.leg === 1)
    );

    const nextMatchIndex = Math.floor(matchIndex / 2);
    const targetLeg1Match = nextRoundMatches[nextMatchIndex];
    if (!targetLeg1Match) return;

    const isHomeSlot = matchIndex % 2 === 0;

    if (isHomeSlot) {
      targetLeg1Match.homeTeamId = winnerId;
    } else {
      targetLeg1Match.awayTeamId = winnerId;
    }
    await this.matchRepo.save(targetLeg1Match);

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
      // ignore
    }
  }
}
