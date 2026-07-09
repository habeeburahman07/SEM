import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Competition } from './competition.entity';
import { Team } from './team.entity';

@Entity('competition_teams')
@Unique(['competitionId', 'teamId'])
@Index('idx_comp_teams_competition_id', ['competitionId'])  // FK: all teams in a competition
@Index('idx_comp_teams_team_id', ['teamId'])                // FK: all competitions a team is in
export class CompetitionTeam {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'competition_id', type: 'uuid' })
  competitionId: string;

  @ManyToOne(() => Competition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'competition_id' })
  competition: Competition;

  @Column({ name: 'team_id', type: 'uuid' })
  teamId: string;

  @ManyToOne(() => Team, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team: Team;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
