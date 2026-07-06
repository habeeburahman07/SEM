import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Competition } from './competition.entity';

@Entity('competition_stages')
export class CompetitionStage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string; // e.g. "Group Stage", "Main Tournament"

  @Column({ type: 'varchar', length: 30 })
  type: 'group' | 'knockout' | 'group_knockout';

  @Column({ type: 'int', default: 1 })
  sequence: number; // Order of stage in the competition

  @Column({ name: 'competition_id', type: 'uuid' })
  competitionId: string;

  @ManyToOne(() => Competition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'competition_id' })
  competition: Competition;

  @Column({ type: 'json', nullable: true })
  config: {
    // Group Stage config
    winPoint?: number;
    drawPoint?: number;

    // Knockout config
    twoLegged?: boolean; // 2 leg (true) or 1 leg KO (false)

    // Group & Knockout config
    groupsCount?: number; // How many groups
    advancingCount?: number; // How many from each group advance (e.g. top 2)
  };

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
