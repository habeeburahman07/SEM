import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToMany } from 'typeorm';
import { Role } from './role.entity';

@Entity('permissions')
@Index('idx_permissions_slug', ['slug'])  // Fast slug-based lookup in ensurePermission
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];
}
