import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { WorkspaceMember } from './workspace-member.entity';

@Entity('workspaces')
@Index('idx_workspaces_owner_id', ['ownerId'])           // FK lookup: all workspaces for a user
@Index('idx_workspaces_slug', ['slug'])                  // Unique slug lookup (duplicate of UNIQUE constraint, kept explicit)
@Index('idx_workspaces_created_at', ['createdAt'])       // Pagination / ordering
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'logo_url', type: 'varchar', length: 500, nullable: true })
  logoUrl: string | null;

  // The user who created and owns this workspace
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @OneToMany(() => WorkspaceMember, (member) => member.workspace, {
    cascade: true,
  })
  members: WorkspaceMember[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
