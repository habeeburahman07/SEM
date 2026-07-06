import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  IsObject,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateStageDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(['group', 'knockout', 'group_knockout'])
  type?: 'group' | 'knockout' | 'group_knockout';

  @IsOptional()
  @IsInt()
  sequence?: number;

  @IsOptional()
  @IsObject()
  config?: {
    winPoint?: number;
    drawPoint?: number;
    twoLegged?: boolean;
    groupsCount?: number;
    advancingCount?: number;
    gamesPerTeam?: number;
  };
}
