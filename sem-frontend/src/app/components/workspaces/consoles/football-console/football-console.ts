import { Component, input, output, signal, inject, effect, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Match, Player, Team, MatchPlayer, CompetitionStage } from '../../../../services/workspace.service';
import { CompetitionService } from '../../../../services/competition.service';
import { UiService } from '../../../../services/ui.service';

@Component({
  selector: 'app-football-console',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './football-console.html',
})
export class FootballConsoleComponent implements OnDestroy {
  private competitionService = inject(CompetitionService);
  private uiService = inject(UiService);

  workspaceId = input.required<string>();
  eventId = input.required<string>();
  competitionId = input.required<string>();
  stageId = input.required<string>();
  match = input.required<Match>();
  players = input.required<Player[]>();
  teams = input.required<Team[]>();
  matchLineup = input.required<MatchPlayer[]>();
  canScore = input<boolean>(false);
  stage = input<CompetitionStage | null>(null);

  matchCompleted = output<void>();
  openLineupModal = output<void>();
  matchUpdated = output<Match>();

  footballTimerInterval: any = null;
  localElapsedSeconds = signal<number>(0);
  enableExtraTime = signal<boolean>(false);
  extraTimeHalfDuration = signal<number>(15);
  enablePenaltyShootout = signal<boolean>(false);

  constructor() {
    effect(() => {
      const match = this.match();
      if (match) {
        this.localElapsedSeconds.set(match.liveData?.elapsedSeconds || 0);
        if (match.status === 'live' && match.liveData?.timerRunning) {
          this.startFootballTimer();
        } else {
          this.stopFootballTimer();
        }
      } else {
        this.stopFootballTimer();
      }
    }, { allowSignalWrites: true });
  }

  ngOnDestroy() {
    this.stopFootballTimer();
  }

  startFootballTimer() {
    if (this.footballTimerInterval) return;
    this.footballTimerInterval = setInterval(() => {
      const match = this.match();
      if (match && match.status === 'live' && match.liveData?.timerRunning) {
        const halfDurationMinutes = match.liveData.halfDurationMinutes || 45;
        const halfSecs = halfDurationMinutes * 60;
        const currentSeconds = this.localElapsedSeconds();
        
        if (match.liveData.currentHalf === 1) {
          if (currentSeconds >= halfSecs) {
            this.stopFootballTimer();
            const live = { ...match.liveData, timerRunning: false, elapsedSeconds: halfSecs };
            this.saveFootballLiveData(live);
            return;
          }
        } else if (match.liveData.currentHalf === 2) {
          if (currentSeconds >= halfSecs * 2) {
            this.stopFootballTimer();
            const live = { ...match.liveData, timerRunning: false, elapsedSeconds: halfSecs * 2 };
            this.saveFootballLiveData(live);
            return;
          }
        } else if (match.liveData.currentHalf === 3) {
          const extraHalfMinutes = match.liveData.extraTimeHalfDurationMinutes || 15;
          const extra1Limit = halfSecs * 2 + extraHalfMinutes * 60;
          if (currentSeconds >= extra1Limit) {
            this.stopFootballTimer();
            const live = { ...match.liveData, timerRunning: false, elapsedSeconds: extra1Limit };
            this.saveFootballLiveData(live);
            return;
          }
        } else if (match.liveData.currentHalf === 4) {
          const extraHalfMinutes = match.liveData.extraTimeHalfDurationMinutes || 15;
          const extra2Limit = halfSecs * 2 + (extraHalfMinutes * 2) * 60;
          if (currentSeconds >= extra2Limit) {
            this.stopFootballTimer();
            const live = { ...match.liveData, timerRunning: false, elapsedSeconds: extra2Limit };
            this.saveFootballLiveData(live);
            return;
          }
        }
        
        this.localElapsedSeconds.update(s => s + 1);
      }
    }, 1000);
  }

  stopFootballTimer() {
    if (this.footballTimerInterval) {
      clearInterval(this.footballTimerInterval);
      this.footballTimerInterval = null;
    }
  }

  hasLineupForMatch(match: Match | null): boolean {
    if (!match) return false;
    const lineup = this.matchLineup();
    const homeHas = lineup.some(le => le.teamId === match.homeTeamId && le.isPlaying);
    const awayHas = lineup.some(le => le.teamId === match.awayTeamId && le.isPlaying);
    return homeHas && awayHas;
  }

  onToggleFootballTimer() {
    const match = this.match();
    if (!match) return;

    if (match.status !== 'live' && !this.hasLineupForMatch(match)) {
      this.openLineupModal.emit();
      return;
    }

    const live = { ...match.liveData };
    live.timerRunning = !live.timerRunning;
    live.elapsedSeconds = this.localElapsedSeconds();

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      liveData: live,
      status: 'live',
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
        if (live.timerRunning) this.startFootballTimer();
        else this.stopFootballTimer();
      },
      error: (err) => {
        const msg = err.error?.message || '';
        if (msg.toLowerCase().includes('lineup')) {
          this.openLineupModal.emit();
        } else {
          this.uiService.error(msg || 'Failed to update match status.');
        }
      }
    });
  }

  onStartFootballMatch(halfDurationMinutes: number, enableExtraTime: boolean = false, enablePenaltyShootout: boolean = false, extraTimeHalfDurationMinutes: number = 15) {
    const match = this.match();
    if (!match) return;

    if (!this.hasLineupForMatch(match)) {
      this.openLineupModal.emit();
      return;
    }

    const live = {
      started: true,
      halfDurationMinutes,
      enableExtraTime,
      enablePenaltyShootout,
      extraTimeHalfDurationMinutes,
      currentHalf: 1,
      elapsedSeconds: 0,
      timerRunning: true,
      events: []
    };

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      liveData: live,
      status: 'live',
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
        this.startFootballTimer();
      },
      error: (err) => {
        const msg = err.error?.message || '';
        if (msg.toLowerCase().includes('lineup')) {
          this.openLineupModal.emit();
        } else {
          this.uiService.error(msg || 'Failed to start football match.');
        }
      }
    });
  }

  onStartSecondHalf() {
    const match = this.match();
    if (!match) return;

    const live = { ...match.liveData };
    const halfDurationMinutes = live.halfDurationMinutes || 45;
    live.currentHalf = 2;
    live.elapsedSeconds = halfDurationMinutes * 60;
    live.timerRunning = true;

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      liveData: live,
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
        this.startFootballTimer();
      }
    });
  }

  saveFootballLiveData(live: any) {
    const match = this.match();
    if (!match) return;

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      liveData: live,
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
      }
    });
  }

  formatFootballTime(seconds: number | undefined | null): string {
    if (seconds == null) return '00:00';
    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;
    const mmStr = mm < 10 ? '0' + mm : '' + mm;
    const ssStr = ss < 10 ? '0' + ss : '' + ss;
    return `${mmStr}:${ssStr}`;
  }

  getFootballPeriodStatus(match: Match | null): string {
    if (!match || !match.liveData?.started) return 'Not Started';
    const live = match.liveData;
    const halfSecs = (live.halfDurationMinutes || 45) * 60;
    const currentSeconds = this.localElapsedSeconds();
    if (live.currentHalf === 1) {
      if (currentSeconds >= halfSecs) return 'Half Time';
      return '1st Half';
    } else if (live.currentHalf === 2) {
      if (currentSeconds >= halfSecs * 2) {
        if (live.enableExtraTime && match.homeScore === match.awayScore) {
          return 'Extra Time Pending';
        }
        return 'Full Time';
      }
      return '2nd Half';
    } else if (live.currentHalf === 3) {
      const extraHalfMinutes = live.extraTimeHalfDurationMinutes || 15;
      const extra1Limit = halfSecs * 2 + extraHalfMinutes * 60;
      if (currentSeconds >= extra1Limit) return 'Extra Half Time';
      return '1st Extra Half';
    } else if (live.currentHalf === 4) {
      const extraHalfMinutes = live.extraTimeHalfDurationMinutes || 15;
      const extra2Limit = halfSecs * 2 + (extraHalfMinutes * 2) * 60;
      if (currentSeconds >= extra2Limit) {
        if (live.enablePenaltyShootout && match.homeScore === match.awayScore) {
          return 'Penalty Shootout Pending';
        }
        return 'Extra Full Time';
      }
      return '2nd Extra Half';
    } else if (live.currentHalf === 5) {
      return 'Penalty Shootout';
    }
    return '';
  }

  isFootballHalfTime(match: Match | null): boolean {
    if (!match || !match.liveData?.started) return false;
    const live = match.liveData;
    const halfSecs = (live.halfDurationMinutes || 45) * 60;
    return live.currentHalf === 1 && this.localElapsedSeconds() >= halfSecs;
  }

  isFootballFullTime(match: Match | null): boolean {
    if (!match || !match.liveData?.started) return false;
    const live = match.liveData;
    const halfSecs = (live.halfDurationMinutes || 45) * 60;
    return live.currentHalf === 2 && this.localElapsedSeconds() >= halfSecs * 2;
  }

  isFootballExtra1Pending(match: Match | null): boolean {
    if (!match || !match.liveData?.started) return false;
    const live = match.liveData;
    const halfSecs = (live.halfDurationMinutes || 45) * 60;
    return live.currentHalf === 2 && this.localElapsedSeconds() >= halfSecs * 2 && live.enableExtraTime && match.homeScore === match.awayScore;
  }

  isFootballExtra1Time(match: Match | null): boolean {
    if (!match || !match.liveData?.started) return false;
    const live = match.liveData;
    const halfSecs = (live.halfDurationMinutes || 45) * 60;
    const extraHalfMinutes = live.extraTimeHalfDurationMinutes || 15;
    const extra1Limit = halfSecs * 2 + extraHalfMinutes * 60;
    return live.currentHalf === 3 && this.localElapsedSeconds() >= extra1Limit;
  }

  isFootballExtra2Time(match: Match | null): boolean {
    if (!match || !match.liveData?.started) return false;
    const live = match.liveData;
    const halfSecs = (live.halfDurationMinutes || 45) * 60;
    const extraHalfMinutes = live.extraTimeHalfDurationMinutes || 15;
    const extra2Limit = halfSecs * 2 + (extraHalfMinutes * 2) * 60;
    return live.currentHalf === 4 && this.localElapsedSeconds() >= extra2Limit;
  }

  isFootballShootoutPending(match: Match | null): boolean {
    if (!match || !match.liveData?.started) return false;
    const live = match.liveData;
    const halfSecs = (live.halfDurationMinutes || 45) * 60;
    const extraHalfMinutes = live.extraTimeHalfDurationMinutes || 15;
    const extra2Limit = halfSecs * 2 + (extraHalfMinutes * 2) * 60;
    return live.currentHalf === 4 && this.localElapsedSeconds() >= extra2Limit && live.enablePenaltyShootout && match.homeScore === match.awayScore;
  }

  onRecordFootballGoal(options: {
    teamId: string;
    goalType: string;
    scorerId: string;
    scorerCustomName?: string;
    assistId?: string;
    assistCustomName?: string;
  }) {
    const { teamId, goalType, scorerId, scorerCustomName, assistId, assistCustomName } = options;
    const match = this.match();
    if (!match) return;

    const live = { ...match.liveData };
    const currentMin = Math.floor(this.localElapsedSeconds() / 60) + 1;

    if (!live.events) live.events = [];
    live.events.push({
      type: 'goal',
      goalType: goalType || 'regular',
      teamId,
      playerUserId: (scorerId && scorerId !== 'unregistered') ? scorerId : undefined,
      playerName: (scorerId === 'unregistered') ? scorerCustomName : undefined,
      assistPlayerUserId: (assistId && assistId !== 'unregistered') ? assistId : undefined,
      assistPlayerName: (assistId === 'unregistered') ? assistCustomName : undefined,
      minute: currentMin,
    });

    const isHome = teamId === match.homeTeamId;
    let newHomeScore = match.homeScore;
    let newAwayScore = match.awayScore;

    if (goalType === 'own_goal') {
      if (isHome) {
        newAwayScore += 1;
      } else {
        newHomeScore += 1;
      }
    } else {
      if (isHome) {
        newHomeScore += 1;
      } else {
        newAwayScore += 1;
      }
    }

    live.elapsedSeconds = this.localElapsedSeconds();

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      homeScore: newHomeScore,
      awayScore: newAwayScore,
      liveData: live,
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
      }
    });
  }

  onRecordFootballCard(teamId: string, playerId: string, cardType: 'yellow' | 'red') {
    const match = this.match();
    if (!match) return;

    const live = { ...match.liveData };
    const currentMin = Math.floor(this.localElapsedSeconds() / 60) + 1;

    if (!live.events) live.events = [];
    
    let finalCardType: 'yellow' | 'red' | 'second_yellow' = cardType;
    if (cardType === 'yellow') {
      const yellowCount = live.events.filter(
        (e: any) => e.type === 'card' && e.playerUserId === playerId && e.cardType === 'yellow'
      ).length;
      if (yellowCount >= 1) {
        finalCardType = 'second_yellow';
      }
    }

    live.events.push({
      type: 'card',
      teamId,
      playerUserId: playerId,
      cardType: finalCardType,
      minute: currentMin,
    });

    live.elapsedSeconds = this.localElapsedSeconds();

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      liveData: live,
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
      }
    });
  }

  onRecordFootballPenalty(teamId: string, kickerId: string, outcome: 'scored' | 'missed' | 'saved' | 'hit_post') {
    const match = this.match();
    if (!match) return;

    const live = { ...match.liveData };
    const currentMin = Math.floor(this.localElapsedSeconds() / 60) + 1;

    if (!live.events) live.events = [];
    
    live.events.push({
      type: 'penalty',
      teamId,
      playerUserId: kickerId,
      outcome,
      minute: currentMin,
    });

    let newHomeScore = match.homeScore;
    let newAwayScore = match.awayScore;

    if (outcome === 'scored') {
      live.events.push({
        type: 'goal',
        goalType: 'penalty',
        teamId,
        playerUserId: kickerId,
        minute: currentMin,
      });

      if (teamId === match.homeTeamId) {
        newHomeScore += 1;
      } else {
        newAwayScore += 1;
      }
    }

    live.elapsedSeconds = this.localElapsedSeconds();

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      homeScore: newHomeScore,
      awayScore: newAwayScore,
      liveData: live,
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
      }
    });
  }

  onRecordFootballSubstitution(teamId: string, playerOutId: string, playerInId: string, reason: string) {
    const match = this.match();
    if (!match) return;

    const live = { ...match.liveData };
    const currentMin = Math.floor(this.localElapsedSeconds() / 60) + 1;

    if (!live.events) live.events = [];
    live.events.push({
      type: 'substitution',
      teamId,
      playerOutId,
      playerInId,
      reason,
      minute: currentMin
    });

    live.elapsedSeconds = this.localElapsedSeconds();

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      liveData: live
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
      }
    });
  }

  onRecordFootballOffside(teamId: string, playerId: string) {
    const match = this.match();
    if (!match) return;

    const live = { ...match.liveData };
    const currentMin = Math.floor(this.localElapsedSeconds() / 60) + 1;

    if (!live.events) live.events = [];
    live.events.push({
      type: 'offside',
      teamId,
      playerUserId: playerId,
      minute: currentMin
    });

    live.elapsedSeconds = this.localElapsedSeconds();

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      liveData: live
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
      }
    });
  }

  onRecordFootballFoul(teamId: string, committedById: string, againstId: string, foulType: string) {
    const match = this.match();
    if (!match) return;

    const live = { ...match.liveData };
    const currentMin = Math.floor(this.localElapsedSeconds() / 60) + 1;

    if (!live.events) live.events = [];
    live.events.push({
      type: 'foul',
      teamId,
      playerUserId: committedById,
      opponentPlayerUserId: againstId,
      foulType,
      minute: currentMin
    });

    live.elapsedSeconds = this.localElapsedSeconds();

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      liveData: live
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
      }
    });
  }

  onRecordFootballFreeKick(teamId: string, takenById: string, freeKickType: 'direct' | 'indirect', result: string) {
    const match = this.match();
    if (!match) return;

    const live = { ...match.liveData };
    const currentMin = Math.floor(this.localElapsedSeconds() / 60) + 1;

    if (!live.events) live.events = [];
    live.events.push({
      type: 'free_kick',
      teamId,
      playerUserId: takenById,
      freeKickType,
      result,
      minute: currentMin
    });

    let newHomeScore = match.homeScore;
    let newAwayScore = match.awayScore;

    if (result === 'scored') {
      live.events.push({
        type: 'goal',
        goalType: 'free_kick',
        teamId,
        playerUserId: takenById,
        minute: currentMin
      });

      if (teamId === match.homeTeamId) {
        newHomeScore += 1;
      } else {
        newAwayScore += 1;
      }
    }

    live.elapsedSeconds = this.localElapsedSeconds();

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      homeScore: newHomeScore,
      awayScore: newAwayScore,
      liveData: live
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
      }
    });
  }

  onRecordFootballCornerKick(teamId: string, takenById: string, side: 'left' | 'right') {
    const match = this.match();
    if (!match) return;

    const live = { ...match.liveData };
    const currentMin = Math.floor(this.localElapsedSeconds() / 60) + 1;

    if (!live.events) live.events = [];
    live.events.push({
      type: 'corner_kick',
      teamId,
      playerUserId: takenById,
      side,
      minute: currentMin
    });

    live.elapsedSeconds = this.localElapsedSeconds();

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      liveData: live
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
      }
    });
  }

  onRecordFootballThrowIn(teamId: string, playerId: string) {
    const match = this.match();
    if (!match) return;

    const live = { ...match.liveData };
    const currentMin = Math.floor(this.localElapsedSeconds() / 60) + 1;

    if (!live.events) live.events = [];
    live.events.push({
      type: 'throw_in',
      teamId,
      playerUserId: playerId,
      minute: currentMin
    });

    live.elapsedSeconds = this.localElapsedSeconds();

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      liveData: live
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
      }
    });
  }

  onRecordFootballGoalKick(teamId: string, goalkeeperId: string) {
    const match = this.match();
    if (!match) return;

    const live = { ...match.liveData };
    const currentMin = Math.floor(this.localElapsedSeconds() / 60) + 1;

    if (!live.events) live.events = [];
    live.events.push({
      type: 'goal_kick',
      teamId,
      playerUserId: goalkeeperId,
      minute: currentMin
    });

    live.elapsedSeconds = this.localElapsedSeconds();

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      liveData: live
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
      }
    });
  }

  onRecordFootballInjury(teamId: string, playerUserId: string, severity: string, substituted: boolean) {
    const match = this.match();
    if (!match) return;

    const live = { ...match.liveData };
    const currentMin = Math.floor(this.localElapsedSeconds() / 60) + 1;

    if (!live.events) live.events = [];
    live.events.push({
      type: 'injury',
      teamId,
      playerUserId,
      severity,
      substituted,
      minute: currentMin
    });

    live.elapsedSeconds = this.localElapsedSeconds();

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      liveData: live
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
      }
    });
  }

  onStartFirstExtraHalf() {
    const match = this.match();
    if (!match) return;

    const live = { ...match.liveData };
    const halfDurationMinutes = live.halfDurationMinutes || 45;
    live.currentHalf = 3;
    live.elapsedSeconds = halfDurationMinutes * 2 * 60;
    live.timerRunning = true;

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      liveData: live,
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
        this.startFootballTimer();
      }
    });
  }

  onStartSecondExtraHalf() {
    const match = this.match();
    if (!match) return;

    const live = { ...match.liveData };
    const halfDurationMinutes = live.halfDurationMinutes || 45;
    const extraHalfMinutes = live.extraTimeHalfDurationMinutes || 15;
    live.currentHalf = 4;
    live.elapsedSeconds = halfDurationMinutes * 2 * 60 + extraHalfMinutes * 60;
    live.timerRunning = true;

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      liveData: live,
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
        this.startFootballTimer();
      }
    });
  }

  onStartPenaltyShootout() {
    const match = this.match();
    if (!match) return;

    const live = { ...match.liveData };
    live.currentHalf = 5;
    live.timerRunning = false;

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      liveData: live,
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
      }
    });
  }

  onRecordFootballShootoutPenalty(teamId: string, playerUserId: string, outcome: 'scored' | 'missed' | 'saved' | 'hit_post') {
    const match = this.match();
    if (!match) return;

    const live = { ...match.liveData };
    if (!live.events) live.events = [];

    const shootoutEvents = live.events.filter((e: any) => e.type === 'shootout_penalty');
    const order = shootoutEvents.length + 1;

    live.events.push({
      type: 'shootout_penalty',
      teamId,
      playerUserId,
      outcome,
      order,
      minute: 120
    });

    if (!live.shootoutHomeScore) live.shootoutHomeScore = 0;
    if (!live.shootoutAwayScore) live.shootoutAwayScore = 0;

    if (outcome === 'scored') {
      if (teamId === match.homeTeamId) {
        live.shootoutHomeScore += 1;
      } else {
        live.shootoutAwayScore += 1;
      }
    }

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      liveData: live
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
      }
    });
  }

  onEndMatchWithResult(result: string) {
    const match = this.match();
    if (!match) return;

    const live = match.liveData ? { ...match.liveData } : {};
    live.result = result;
    live.elapsedSeconds = this.localElapsedSeconds();

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      status: 'completed',
      liveData: live,
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
        this.stopFootballTimer();
        this.matchCompleted.emit();
      }
    });
  }

  onEndMatch() {
    const match = this.match();
    if (!match) return;

    this.competitionService.updateMatch(this.workspaceId(), this.eventId(), this.competitionId(), this.stageId(), match.id, {
      status: 'completed',
    }).subscribe({
      next: (updated) => {
        this.matchUpdated.emit(updated);
        this.stopFootballTimer();
        this.matchCompleted.emit();
      }
    });
  }

  getPlayersForTeam(teamId: string | null): Player[] {
    if (!teamId) return [];
    const match = this.match();
    const inactiveIds = new Set<string>();
    const subbedInUserIds = new Set<string>();
    if (match?.liveData?.events) {
      for (const ev of match.liveData.events) {
        if (ev.type === 'card' && (ev.cardType === 'red' || ev.cardType === 'second_yellow')) {
          if (ev.playerUserId) {
            inactiveIds.add(ev.playerUserId);
          }
        }
        if (ev.type === 'substitution') {
          if (ev.playerOutId) {
            inactiveIds.add(ev.playerOutId);
          }
          if (ev.playerInId) {
            subbedInUserIds.add(ev.playerInId);
          }
        }
        if (ev.type === 'injury' && ev.substituted) {
          if (ev.playerUserId) {
            inactiveIds.add(ev.playerUserId);
          }
        }
      }
    }
    
    const teamPlayers = this.players().filter(p => p.teamId === teamId && !inactiveIds.has(p.userId));
    const lineup = this.matchLineup();
    const hasMappedLineup = lineup.some(le => le.teamId === teamId && le.isPlaying);
    
    if (hasMappedLineup) {
      const playingPlayerIds = new Set(lineup.filter(le => le.teamId === teamId && le.isPlaying).map(le => le.playerId));
      return teamPlayers.filter(p => playingPlayerIds.has(p.id) || subbedInUserIds.has(p.userId));
    }
    
    return teamPlayers;
  }

  getBenchPlayersForTeam(teamId: string | null): Player[] {
    if (!teamId) return [];
    const match = this.match();
    const inactiveIds = new Set<string>();
    const subbedInIds = new Set<string>();
    
    if (match?.liveData?.events) {
      for (const ev of match.liveData.events) {
        if (ev.type === 'card' && (ev.cardType === 'red' || ev.cardType === 'second_yellow')) {
          if (ev.playerUserId) {
            inactiveIds.add(ev.playerUserId);
          }
        }
        if (ev.type === 'substitution') {
          if (ev.playerOutId) {
            inactiveIds.add(ev.playerOutId);
          }
          if (ev.playerInId) {
            subbedInIds.add(ev.playerInId);
          }
        }
        if (ev.type === 'injury' && ev.substituted) {
          if (ev.playerUserId) {
            inactiveIds.add(ev.playerUserId);
          }
        }
      }
    }

    const teamPlayers = this.players().filter(p => 
      p.teamId === teamId && 
      !inactiveIds.has(p.userId) && 
      !subbedInIds.has(p.userId)
    );

    const lineup = this.matchLineup();
    const hasMappedLineup = lineup.some(le => le.teamId === teamId && le.isPlaying);

    if (hasMappedLineup) {
      const benchPlayerIds = new Set(lineup.filter(le => le.teamId === teamId && !le.isPlaying).map(le => le.playerId));
      return teamPlayers.filter(p => benchPlayerIds.has(p.id));
    }

    return teamPlayers;
  }

  avatarColor(name: string): string {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  initials(name: string): string {
    if (!name) return '';
    const parts = name.split(' ');
    if (parts.length > 1) {
      return parts.slice(0, 2).map(w => w[0]).join('').toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
}
