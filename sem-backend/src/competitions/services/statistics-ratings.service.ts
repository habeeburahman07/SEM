import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Competition } from '../../workspaces/entities/competition.entity';
import { CompetitionStage } from '../../workspaces/entities/competition-stage.entity';
import { Match } from '../../workspaces/entities/match.entity';
import { MatchPlayer } from '../../workspaces/entities/match-player.entity';
import { WorkspacesService } from '../../workspaces/workspaces.service';
import { NotificationType } from '../../workspaces/entities/notification.entity';

@Injectable()
export class StatisticsRatingsService {
  constructor(
    @InjectRepository(Competition)
    private readonly competitionRepo: Repository<Competition>,
    @InjectRepository(CompetitionStage)
    private readonly stageRepo: Repository<CompetitionStage>,
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,
    @InjectRepository(MatchPlayer)
    private readonly matchPlayerRepo: Repository<MatchPlayer>,
    private readonly workspacesService: WorkspacesService,
  ) {}

  async getMatchRatings(
    workspaceId: string,
    eventId: string,
    competitionId: string,
    stageId: string,
    matchId: string,
    userId: string,
  ): Promise<MatchPlayer[]> {
    await this.workspacesService.ensureMember(workspaceId, userId);

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
    
    const competition = await this.competitionRepo.findOne({
      where: { id: competitionId, eventId },
      relations: { sport: true },
    });
    if (!competition) throw new NotFoundException('Competition not found');

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

  async autoRateMatchPlayers(match: Match): Promise<void> {
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
}
