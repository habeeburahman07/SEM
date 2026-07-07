import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Workspace } from './workspace.entity';
import { Competition } from './competition.entity';
import { Team } from './team.entity';

@Entity('events')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'start_date', type: 'timestamp without time zone', nullable: true })
  startDate: Date | null;

  @Column({ name: 'end_date', type: 'timestamp without time zone', nullable: true })
  endDate: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'upcoming' })
  status: string; // 'upcoming' | 'ongoing' | 'completed' | 'cancelled'

  @Column({ name: 'logo_url', type: 'varchar', length: 500, nullable: true })
  logoUrl: string | null;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @OneToMany(() => Competition, (competition) => competition.event)
  competitions: Competition[];

  @ManyToMany(() => Team, { onDelete: 'CASCADE' })
  @JoinTable({
    name: 'event_teams',
    joinColumn: { name: 'event_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'team_id', referencedColumnName: 'id' },
  })
  teams: Team[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
