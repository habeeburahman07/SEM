import { IsNotEmpty, IsUUID, IsOptional, IsObject } from 'class-validator';

export class CreateMatchDto {
  @IsNotEmpty()
  @IsUUID()
  homeTeamId: string;

  @IsNotEmpty()
  @IsUUID()
  awayTeamId: string;

  @IsOptional()
  @IsObject()
  config?: {
    timerDuration?: number;
    overs?: number;
    setsToWin?: number;
  };
}
