import { IsNotEmpty, IsUUID, IsOptional, IsObject } from 'class-validator';
import { MatchType } from '../../workspaces/entities/match.entity';

export class CreateMatchDto {
  @IsNotEmpty()
  @IsUUID()
  homeTeamId: string;

  @IsNotEmpty()
  @IsUUID()
  awayTeamId: string;

  @IsOptional()
  @IsUUID()
  venueId?: string;

  @IsOptional()
  @IsObject()
  config?: {
    timerDuration?: number;
    overs?: number;
    setsToWin?: number;
    matchType?: MatchType;
  };
}
