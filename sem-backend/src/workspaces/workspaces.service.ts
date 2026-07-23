import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMember, WorkspaceRole, MANAGEMENT_ROLES } from './entities/workspace-member.entity';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { Team } from './entities/team.entity';
import { Player } from './entities/player.entity';
import { Event } from './entities/event.entity';
import { Sport } from './entities/sport.entity';
import { Competition } from './entities/competition.entity';
import { CompetitionStage } from './entities/competition-stage.entity';
import { Match } from './entities/match.entity';
import { Venue } from './entities/venue.entity';
import { Notification, NotificationType, NOTIFICATION_ICONS } from './entities/notification.entity';
import { MatchPlayer } from './entities/match-player.entity';
import { AuditLog, AuditCategory } from './entities/audit-log.entity';
import { SystemConfig } from './entities/system-config.entity';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { UsersService } from '../users/users.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';

import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { BulkImportMembersDto } from './dto/bulk-import-members.dto';

import { CreateSportDto } from './dto/create-sport.dto';
import { EventsGateway } from './events.gateway';
import { UpdateSportDto } from './dto/update-sport.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Injectable()
export class WorkspacesService implements OnModuleInit {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    @InjectRepository(Player)
    private readonly playerRepo: Repository<Player>,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    @InjectRepository(Sport)
    private readonly sportRepo: Repository<Sport>,
    @InjectRepository(Competition)
    private readonly competitionRepo: Repository<Competition>,
    @InjectRepository(CompetitionStage)
    private readonly stageRepo: Repository<CompetitionStage>,
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,
    @InjectRepository(Venue)
    private readonly venueRepo: Repository<Venue>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(MatchPlayer)
    private readonly matchPlayerRepo: Repository<MatchPlayer>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    @InjectRepository(SystemConfig)
    private readonly systemConfigRepo: Repository<SystemConfig>,
    private readonly usersService: UsersService,
    private readonly eventsGateway: EventsGateway,
  ) { }


  async onModuleInit() {
    const defaultSports = [
      { name: 'Football', code: 'football', description: 'Association football/soccer' },
      { name: 'Cricket', code: 'cricket', description: 'Bat-and-ball game played between two teams' },
      { name: 'Badminton', code: 'badminton', description: 'Racket sport played with shuttlecocks' },
    ];

    for (const s of defaultSports) {
      const existing = await this.sportRepo.findOne({ where: { code: s.code } });
      if (!existing) {
        await this.sportRepo.save(this.sportRepo.create(s));
      }
    }

    const defaultPermissions = [
      { slug: 'workspace.read', name: 'Read Workspace', description: 'View workspace details, events, and members' },
      { slug: 'workspace.update', name: 'Update Workspace', description: 'Modify workspace name, description, and configurations' },
      { slug: 'workspace.delete', name: 'Delete Workspace', description: 'Permanently remove the workspace and all its data' },
      { slug: 'member.invite', name: 'Invite Members', description: 'Send invitations to new users to join the workspace' },
      { slug: 'member.update', name: 'Update Members', description: 'Update workspace member roles' },
      { slug: 'member.remove', name: 'Remove Members', description: 'Remove members from the workspace' },
      { slug: 'role.manage', name: 'Manage Roles', description: 'Create, modify, and delete custom workspace roles and map permissions' },
      { slug: 'team.manage', name: 'Manage Teams', description: 'Create, edit, and delete teams inside the workspace' },
      { slug: 'player.manage', name: 'Manage Players', description: 'Add, update, or remove players in teams' },
      { slug: 'event.manage', name: 'Manage Events', description: 'Create, update, and close events' },
      { slug: 'competition.manage', name: 'Manage Competitions', description: 'Create and configure competitions for events' },
      { slug: 'match.score', name: 'Score Matches', description: 'Record, edit, and finalise scores for match fixtures' },
    ];

    const seededPermissions: Record<string, Permission> = {};
    for (const p of defaultPermissions) {
      let existing = await this.permissionRepo.findOne({ where: { slug: p.slug } });
      if (!existing) {
        existing = await this.permissionRepo.save(this.permissionRepo.create(p));
      }
      seededPermissions[p.slug] = existing;
    }

    const defaultRoles = [
      { slug: 'owner', name: 'Owner', description: 'Full control — delete workspace, manage all', isSystem: true },
      { slug: 'administrator', name: 'Administrator', description: 'Manage members, events, settings', isSystem: true },
      { slug: 'event_manager', name: 'Event Manager', description: 'Create/edit events and competitions', isSystem: true },
      { slug: 'competition_manager', name: 'Competition Manager', description: 'Manage brackets, fixtures, results', isSystem: true },
      { slug: 'referee', name: 'Referee', description: 'Enter match scores, manage assigned fixtures', isSystem: true },
      { slug: 'statistician', name: 'Statistician', description: 'Enter/edit player & match statistics', isSystem: true },
      { slug: 'media_team', name: 'Media Team', description: 'Upload photos, announcements', isSystem: true },
      { slug: 'viewer', name: 'Viewer', description: 'Read-only access to all workspace data', isSystem: true },
    ];

    const rolePermissionMapping: Record<string, string[]> = {
      owner: ['workspace.read', 'workspace.update', 'workspace.delete', 'member.invite', 'member.update', 'member.remove', 'role.manage', 'team.manage', 'player.manage', 'event.manage', 'competition.manage', 'match.score'],
      administrator: ['workspace.read', 'workspace.update', 'member.invite', 'member.update', 'member.remove', 'role.manage', 'team.manage', 'player.manage', 'event.manage', 'competition.manage', 'match.score'],
      event_manager: ['workspace.read', 'team.manage', 'player.manage', 'event.manage', 'competition.manage'],
      competition_manager: ['workspace.read', 'competition.manage', 'match.score'],
      referee: ['workspace.read', 'match.score'],
      statistician: ['workspace.read', 'match.score'],
      media_team: ['workspace.read'],
      viewer: ['workspace.read'],
    };

    for (const r of defaultRoles) {
      let existing = await this.roleRepo.findOne({ where: { slug: r.slug, isSystem: true }, relations: { permissions: true } });
      if (!existing) {
        existing = await this.roleRepo.save(this.roleRepo.create(r));
        existing.permissions = [];
      }

      const requiredSlugs = rolePermissionMapping[r.slug] || [];
      const currentSlugs = existing.permissions?.map(p => p.slug) || [];
      const needsUpdate = requiredSlugs.some(slug => !currentSlugs.includes(slug)) || currentSlugs.some(slug => !requiredSlugs.includes(slug));

      if (needsUpdate || !existing.permissions) {
        existing.permissions = requiredSlugs.map(slug => seededPermissions[slug]).filter(Boolean);
        await this.roleRepo.save(existing);
      }
    }
  }

  async findRoleBySlug(slug: string, workspaceId: string | null): Promise<Role> {
    let role = null;
    if (workspaceId) {
      role = await this.roleRepo.findOne({ where: { slug, workspaceId } });
    }
    if (!role) {
      role = await this.roleRepo.findOne({ where: { slug, isSystem: true } });
    }
    if (!role) {
      throw new NotFoundException(`Role "${slug}" not found`);
    }
    return role;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────


  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 100);
  }

  private async ensureUniqueSlug(base: string): Promise<string> {
    let slug = base;
    let counter = 1;
    while (await this.workspaceRepo.findOne({ where: { slug } })) {
      slug = `${base}-${counter++}`;
    }
    return slug;
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(dto: CreateWorkspaceDto, ownerId: string): Promise<Workspace> {
    const baseSlug = dto.slug ?? this.generateSlug(dto.name);
    const slug = await this.ensureUniqueSlug(baseSlug);

    // Check slug conflict if user manually provided one
    if (dto.slug && slug !== dto.slug) {
      throw new ConflictException(`Slug "${dto.slug}" is already taken`);
    }

    const workspace = this.workspaceRepo.create({
      name: dto.name,
      slug,
      description: dto.description ?? null,
      logoUrl: dto.logoUrl ?? null,
      ownerId,
    });

    const savedWorkspace = await this.workspaceRepo.save(workspace);

    // Auto-add owner as a OWNER-role member
    const ownerRole = await this.findRoleBySlug('owner', null);
    const ownerMember = this.memberRepo.create({
      workspaceId: savedWorkspace.id,
      userId: ownerId,
      roleId: ownerRole.id,
    });
    await this.memberRepo.save(ownerMember);

    // 1.1 — Notify the creator
    await this.sendNotification(
      ownerId,
      NotificationType.WORKSPACE_CREATED,
      `Welcome! Your workspace ${savedWorkspace.name} has been created successfully.`,
      savedWorkspace.id,
      { workspaceName: savedWorkspace.name },
    );

    return savedWorkspace;
  }

  // ─── Find all workspaces for a user ───────────────────────────────────────

  async findAllForUser(userId: string): Promise<Workspace[]> {
    const memberships = await this.memberRepo.find({
      where: { userId, status: 'joined' },
      relations: { workspace: true },
    });
    return memberships.map((m) => m.workspace);
  }

  // ─── Dashboard Overview ──────────────────────────────────────────────────

  async getDashboardOverview(userId: string): Promise<any> {
    const memberships = await this.memberRepo.find({
      where: { userId, status: 'joined' },
      relations: { workspace: true },
    });
    const workspaces = memberships.map((m) => m.workspace).filter(Boolean);
    const workspaceIds = workspaces.map((w) => w.id);

    if (workspaceIds.length === 0) {
      return {
        workspaces: [],
        liveMatches: [],
        upcomingMatches: [],
        runningCompetitions: [],
        topScorers: [],
        topRatedPlayers: [],
        statsSummary: {
          totalWorkspaces: 0,
          totalEvents: 0,
          totalTeams: 0,
          totalPlayers: 0,
          totalLiveMatches: 0,
        },
      };
    }

    const events = await this.eventRepo.find({
      where: { workspaceId: In(workspaceIds) },
    });
    const eventIds = events.map((e) => e.id);

    let competitions: Competition[] = [];
    if (eventIds.length > 0) {
      competitions = await this.competitionRepo.find({
        where: { eventId: In(eventIds) },
        relations: { sport: true, event: true },
      });
    }
    const competitionIds = competitions.map((c) => c.id);

    let stages: CompetitionStage[] = [];
    if (competitionIds.length > 0) {
      stages = await this.stageRepo.find({
        where: { competitionId: In(competitionIds) },
      });
    }
    const stageIds = stages.map((s) => s.id);

    let liveMatches: Match[] = [];
    if (stageIds.length > 0) {
      liveMatches = await this.matchRepo.find({
        where: { stageId: In(stageIds), status: 'live' },
        relations: {
          homeTeam: true,
          awayTeam: true,
          venue: true,
          stage: { competition: { event: true, sport: true } },
        },
        order: { updatedAt: 'DESC' },
      });
    }

    let upcomingMatches: Match[] = [];
    if (stageIds.length > 0) {
      upcomingMatches = await this.matchRepo.find({
        where: { stageId: In(stageIds), status: 'scheduled' },
        relations: {
          homeTeam: true,
          awayTeam: true,
          venue: true,
          stage: { competition: { event: true, sport: true } },
        },
        order: { createdAt: 'ASC' },
        take: 8,
      });
    }

    const runningCompetitions: any[] = [];
    for (const comp of competitions) {
      const compStages = stages.filter((s) => s.competitionId === comp.id);
      const compStageIds = compStages.map((s) => s.id);
      if (compStageIds.length === 0) continue;

      const compMatches = await this.matchRepo.find({
        where: { stageId: In(compStageIds) },
        relations: { homeTeam: true, awayTeam: true },
      });

      if (compMatches.length === 0) continue;

      const standingsMap = new Map<string, any>();
      for (const m of compMatches) {
        if (m.status !== 'completed' && m.status !== 'live') continue;
        if (!m.homeTeamId || !m.awayTeamId) continue;

        if (!standingsMap.has(m.homeTeamId)) {
          standingsMap.set(m.homeTeamId, {
            teamId: m.homeTeamId,
            teamName: m.homeTeam?.name ?? 'Home',
            teamLogoUrl: m.homeTeam?.logoUrl,
            played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0,
          });
        }
        if (!standingsMap.has(m.awayTeamId)) {
          standingsMap.set(m.awayTeamId, {
            teamId: m.awayTeamId,
            teamName: m.awayTeam?.name ?? 'Away',
            teamLogoUrl: m.awayTeam?.logoUrl,
            played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0,
          });
        }

        const h = standingsMap.get(m.homeTeamId);
        const a = standingsMap.get(m.awayTeamId);

        h.played++;
        a.played++;
        const hScore = m.homeScore ?? 0;
        const aScore = m.awayScore ?? 0;
        h.gf += hScore;
        h.ga += aScore;
        a.gf += aScore;
        a.ga += hScore;

        if (hScore > aScore) {
          h.won++; h.pts += 3; a.lost++;
        } else if (hScore < aScore) {
          a.won++; a.pts += 3; h.lost++;
        } else {
          h.drawn++; h.pts += 1; a.drawn++; a.pts += 1;
        }
        h.gd = h.gf - h.ga;
        a.gd = a.gf - a.ga;
      }

      const standings = Array.from(standingsMap.values()).sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.gd !== a.gd) return b.gd - a.gd;
        return b.gf - a.gf;
      });

      runningCompetitions.push({
        id: comp.id,
        name: comp.name,
        status: comp.status,
        sport: comp.sport,
        eventId: comp.eventId,
        eventName: comp.event?.name,
        workspaceId: comp.event?.workspaceId,
        standings,
      });
    }

    let topRatedPlayers: any[] = [];
    let topScorers: any[] = [];

    if (stageIds.length > 0) {
      const allMatches = await this.matchRepo.find({
        where: { stageId: In(stageIds) },
      });
      const matchIds = allMatches.map((m) => m.id);

      if (matchIds.length > 0) {
        const allMatchPlayers = await this.matchPlayerRepo.find({
          where: { matchId: In(matchIds), isPlaying: true },
          relations: { player: { user: true }, team: true },
        });

        const ratingsMap = new Map<string, { playerId: string; playerName: string; teamName: string; ratings: number[] }>();
        for (const mp of allMatchPlayers) {
          if (mp.rating !== null && mp.rating !== undefined) {
            const playerName = mp.player?.user?.username ?? mp.player?.jerseyNumber?.toString() ?? 'Player';
            const teamName = mp.team?.name ?? 'Team';
            let item = ratingsMap.get(mp.playerId);
            if (!item) {
              item = { playerId: mp.playerId, playerName, teamName, ratings: [] };
              ratingsMap.set(mp.playerId, item);
            }
            item.ratings.push(Number(mp.rating));
          }
        }

        topRatedPlayers = Array.from(ratingsMap.values()).map((r) => ({
          playerId: r.playerId,
          playerName: r.playerName,
          teamName: r.teamName,
          avgRating: Math.round((r.ratings.reduce((a, b) => a + b, 0) / r.ratings.length) * 10) / 10,
          appearances: r.ratings.length,
        })).sort((a, b) => b.avgRating - a.avgRating).slice(0, 5);

        const scorersMap = new Map<string, { playerId: string; playerName: string; teamName: string; score: number }>();
        for (const m of allMatches) {
          const eventsList = (m.liveData as any)?.events;
          if (Array.isArray(eventsList)) {
            for (const ev of eventsList) {
              if (ev.type === 'goal' && ev.goalType !== 'own_goal' && ev.playerUserId) {
                const mp = allMatchPlayers.find((p) => p.player?.userId === ev.playerUserId);
                const pId = mp?.playerId ?? ev.playerUserId;
                const pName = mp?.player?.user?.username ?? ev.playerUserId;
                const tName = mp?.team?.name ?? 'Team';

                let item = scorersMap.get(pId);
                if (!item) {
                  item = { playerId: pId, playerName: pName, teamName: tName, score: 0 };
                  scorersMap.set(pId, item);
                }
                item.score++;
              }
            }
          }
        }

        topScorers = Array.from(scorersMap.values())
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
      }
    }

    const totalTeams = await this.teamRepo.count({ where: { workspaceId: In(workspaceIds) } });
    const totalPlayers = await this.playerRepo.count({ where: { workspaceId: In(workspaceIds) } });

    return {
      workspaces,
      liveMatches,
      upcomingMatches,
      runningCompetitions,
      topScorers,
      topRatedPlayers,
      statsSummary: {
        totalWorkspaces: workspaces.length,
        totalEvents: events.length,
        totalTeams,
        totalPlayers,
        totalLiveMatches: liveMatches.length,
      },
    };
  }

  // ─── Find one ─────────────────────────────────────────────────────────────

  async findOne(id: string, userId: string): Promise<Workspace> {
    await this.ensureMember(id, userId);
    const workspace = await this.workspaceRepo.findOne({
      where: { id },
      relations: { members: { user: true } },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }

  async findBySlug(slug: string, userId: string): Promise<Workspace> {
    const workspace = await this.workspaceRepo.findOne({
      where: { slug },
      relations: { members: { user: true } },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    await this.ensureMember(workspace.id, userId);
    return workspace;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateWorkspaceDto, userId: string): Promise<Workspace> {
    await this.ensurePermission(id, userId, 'workspace.update');

    const workspace = await this.workspaceRepo.findOne({ where: { id } });
    if (!workspace) throw new NotFoundException('Workspace not found');

    if (dto.slug && dto.slug !== workspace.slug) {
      const existing = await this.workspaceRepo.findOne({ where: { slug: dto.slug } });
      if (existing) throw new ConflictException(`Slug "${dto.slug}" is already taken`);
    }

    Object.assign(workspace, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.slug !== undefined && { slug: dto.slug }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
    });

    return this.workspaceRepo.save(workspace).then(async (saved) => {
      // 1.2 — Notify all workspace members
      const memberIds = await this.getWorkspaceMemberUserIds(id, userId);
      await this.sendNotificationToMany(
        memberIds,
        NotificationType.WORKSPACE_UPDATED,
        `Workspace ${saved.name} settings have been updated.`,
        id,
        { workspaceName: saved.name },
      );
      return saved;
    });
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async remove(id: string, userId: string): Promise<void> {
    await this.ensurePermission(id, userId, 'workspace.delete');
    const workspace = await this.workspaceRepo.findOne({ where: { id } });
    if (!workspace) throw new NotFoundException('Workspace not found');

    // 1.3 — Notify all members (except owner) before deleting
    const memberIds = await this.getWorkspaceMemberUserIds(id, userId);
    await this.sendNotificationToMany(
      memberIds,
      NotificationType.WORKSPACE_DELETED,
      `The workspace ${workspace.name} has been deleted by the owner.`,
      null,
      { workspaceName: workspace.name },
    );

    await this.workspaceRepo.remove(workspace);
  }

  // ─── Members ──────────────────────────────────────────────────────────────

  async getMembers(workspaceId: string, userId: string): Promise<WorkspaceMember[]> {
    await this.ensureMember(workspaceId, userId);
    return this.memberRepo.find({
      where: { workspaceId, status: 'joined' },
      relations: { user: true, role: { permissions: true } },
      order: { joinedAt: 'ASC' },
    });
  }

  async inviteMember(
    workspaceId: string,
    dto: InviteMemberDto,
    requesterId: string,
  ): Promise<WorkspaceMember> {
    await this.ensurePermission(workspaceId, requesterId, 'member.invite');

    const user = await this.usersService.findOneByUsername(dto.username);
    if (!user) {
      throw new NotFoundException(`User "${dto.username}" not found`);
    }

    const existing = await this.memberRepo.findOne({
      where: { workspaceId, userId: user.id },
    });
    if (existing) {
      if (existing.status === 'pending') {
        throw new ConflictException('User already has a pending invitation');
      }
      throw new ConflictException('User is already a member of this workspace');
    }

    const role = await this.findRoleBySlug(dto.role, workspaceId);
    if (role.slug === WorkspaceRole.OWNER) {
      throw new ForbiddenException('Cannot invite a user as Owner');
    }

    const member = this.memberRepo.create({
      workspaceId,
      userId: user.id,
      roleId: role.id,
      status: 'pending',
      invitedById: requesterId,
    });
    const saved = await this.memberRepo.save(member);
    saved.user = user;
    saved.role = role;

    // 2.1 — Notify invited user
    const workspace = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
    await this.sendNotification(
      user.id,
      NotificationType.MEMBER_INVITED,
      `You've been invited to join ${workspace?.name ?? 'a workspace'} as ${role.name}.`,
      workspaceId,
      { role: role.name, invitedBy: requesterId },
    );

    return saved;
  }

  async bulkImportMembers(
    workspaceId: string,
    dto: BulkImportMembersDto,
    requesterId: string,
  ): Promise<{ success: any[]; failed: any[] }> {
    await this.ensurePermission(workspaceId, requesterId, 'member.invite');

    const success = [];
    const failed = [];

    for (const item of dto.members) {
      try {
        let user = await this.usersService.findOneByUsername(item.username);
        let isNew = false;
        if (!user) {
          user = await this.usersService.create(item.username, dto.password, true);
          isNew = true;
        }

        const existing = await this.memberRepo.findOne({
          where: { workspaceId, userId: user.id },
        });

        if (existing) {
          failed.push({
            username: item.username,
            error: 'User is already a member of this workspace',
          });
          continue;
        }

        const roleSlug = item.role || 'viewer';
        const role = await this.findRoleBySlug(roleSlug, workspaceId);
        if (role.slug === WorkspaceRole.OWNER) {
          failed.push({
            username: item.username,
            error: 'Cannot import a user as Owner',
          });
          continue;
        }

        const member = this.memberRepo.create({
          workspaceId,
          userId: user.id,
          roleId: role.id,
          status: 'joined',
          invitedById: requesterId,
        });

        const saved = await this.memberRepo.save(member);
        success.push({
          username: item.username,
          isNew,
          memberId: saved.id,
          role: role.name,
        });
      } catch (err) {
        failed.push({
          username: item.username,
          error: err.message || 'Import failed',
        });
      }
    }

    // 2.8 / 2.9 / 2.10 — Bulk import notifications
    const workspace = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
    const wsName = workspace?.name ?? 'the workspace';
    for (const item of success) {
      const user = await this.usersService.findOneByUsername(item.username);
      if (user) {
        if (item.isNew) {
          // 2.8 — New user: welcome + change password
          await this.sendNotification(
            user.id,
            NotificationType.BULK_IMPORT_CHANGE_PASSWORD,
            `Welcome to SEM! You've been added to ${wsName}. Please change your default password for security.`,
            workspaceId,
            { workspaceName: wsName, role: item.role },
          );
        } else {
          // 2.9 — Existing user added
          await this.sendNotification(
            user.id,
            NotificationType.BULK_IMPORT_USER,
            `You've been added to ${wsName} as ${item.role}.`,
            workspaceId,
            { workspaceName: wsName, role: item.role },
          );
        }
      }
    }
    // 2.10 — Notify the admin who ran the import
    await this.sendNotification(
      requesterId,
      NotificationType.BULK_IMPORT_COMPLETED,
      `Bulk import completed: ${success.length} added, ${failed.length} failed.`,
      workspaceId,
      { successCount: success.length, failedCount: failed.length },
    );

    return { success, failed };
  }

  async joinWorkspace(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember> {
    const workspace = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const existing = await this.memberRepo.findOne({
      where: { workspaceId, userId },
      relations: { user: true, role: true },
    });
    if (existing) {
      if (existing.status === 'pending') {
        existing.status = 'joined';
        return this.memberRepo.save(existing);
      }
      return existing;
    }

    const role = await this.findRoleBySlug('viewer', workspaceId);

    const member = this.memberRepo.create({
      workspaceId,
      userId,
      roleId: role.id,
      status: 'joined',
    });
    const saved = await this.memberRepo.save(member);

    const fullMember = await this.memberRepo.findOne({
      where: { id: saved.id },
      relations: { user: true, role: true },
    });

    // 2.5 — Notify workspace admins/owner that a user joined
    const adminIds = await this.getWorkspaceAdminUserIds(workspaceId);
    await this.sendNotificationToMany(
      adminIds.filter((id) => id !== userId),
      NotificationType.MEMBER_JOINED,
      `${fullMember!.user.username} joined ${workspace.name}.`,
      workspaceId,
      { username: fullMember!.user.username },
    );

    return fullMember!;
  }

  async getPendingInvitations(userId: string): Promise<WorkspaceMember[]> {
    return this.memberRepo.find({
      where: { userId, status: 'pending' },
      relations: { workspace: true },
    });
  }

  async acceptInvitation(workspaceId: string, userId: string): Promise<WorkspaceMember> {
    const member = await this.memberRepo.findOne({
      where: { workspaceId, userId, status: 'pending' },
      relations: { user: true, role: true, workspace: true },
    });
    if (!member) {
      throw new NotFoundException('Invitation not found or already accepted/rejected');
    }
    member.status = 'joined';
    const saved = await this.memberRepo.save(member);

    // 2.3 — Notify the user who joined
    await this.sendNotification(
      userId,
      NotificationType.INVITATION_ACCEPTED,
      `You joined the ${member.workspace.name} workspace.`,
      workspaceId,
      { workspaceName: member.workspace.name },
    );

    // 2.2 — Notify the inviter
    if (member.invitedById) {
      await this.sendNotification(
        member.invitedById,
        NotificationType.INVITATION_ACCEPTED,
        `${member.user.username} accepted your invitation to the ${member.workspace.name} workspace.`,
        workspaceId,
        { username: member.user.username, workspaceName: member.workspace.name },
      );
    }

    return saved;
  }

  async rejectInvitation(workspaceId: string, userId: string): Promise<void> {
    const member = await this.memberRepo.findOne({
      where: { workspaceId, userId, status: 'pending' },
      relations: { user: true, workspace: true },
    });
    if (!member) {
      throw new NotFoundException('Invitation not found or already accepted/rejected');
    }

    // 2.4 — Notify the inviter
    if (member.invitedById) {
      await this.sendNotification(
        member.invitedById,
        NotificationType.INVITATION_REJECTED,
        `${member.user.username} rejected your invitation to the ${member.workspace.name} workspace.`,
        workspaceId,
        { username: member.user.username, workspaceName: member.workspace.name },
      );
    }

    await this.memberRepo.remove(member);
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    return this.notificationRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async markNotificationsRead(userId: string): Promise<void> {
    await this.notificationRepo.update({ userId, isRead: false }, { isRead: true });
  }

  // ─── Notification Helpers ────────────────────────────────────────────────────

  /**
   * Send a single notification to one user.
   */
  async sendNotification(
    userId: string,
    type: NotificationType,
    message: string,
    workspaceId?: string | null,
    metadata?: Record<string, any> | null,
  ): Promise<void> {
    const notification = this.notificationRepo.create({
      userId,
      type,
      message,
      icon: NOTIFICATION_ICONS[type] || null,
      workspaceId: workspaceId ?? null,
      metadata: metadata ?? null,
    });
    const saved = await this.notificationRepo.save(notification);
    this.eventsGateway.sendNotification(userId, saved);
  }

  /**
   * Send the same notification to multiple users at once.
   */
  async sendNotificationToMany(
    userIds: string[],
    type: NotificationType,
    message: string,
    workspaceId?: string | null,
    metadata?: Record<string, any> | null,
  ): Promise<void> {
    if (userIds.length === 0) return;
    const uniqueIds = [...new Set(userIds)];
    const notifications = uniqueIds.map((uid) =>
      this.notificationRepo.create({
        userId: uid,
        type,
        message,
        icon: NOTIFICATION_ICONS[type] || null,
        workspaceId: workspaceId ?? null,
        metadata: metadata ?? null,
      }),
    );
    const saved = await this.notificationRepo.save(notifications);
    for (const notification of saved) {
      this.eventsGateway.sendNotification(notification.userId, notification);
    }
  }

  /**
   * Get all member user IDs for a workspace (status = 'joined').
   */
  async getWorkspaceMemberUserIds(workspaceId: string, excludeUserId?: string): Promise<string[]> {
    const members = await this.memberRepo.find({
      where: { workspaceId, status: 'joined' },
      select: { userId: true },
    });
    const ids = members.map((m) => m.userId);
    if (excludeUserId) return ids.filter((id) => id !== excludeUserId);
    return ids;
  }

  /**
   * Get admin/owner user IDs for a workspace.
   */
  private async getWorkspaceAdminUserIds(workspaceId: string): Promise<string[]> {
    const members = await this.memberRepo.find({
      where: { workspaceId, status: 'joined' },
      relations: { role: true },
    });
    return members
      .filter((m) => MANAGEMENT_ROLES.includes(m.role.slug))
      .map((m) => m.userId);
  }

  /**
   * Get all player user IDs for a given team.
   */
  async getTeamPlayerUserIds(teamId: string): Promise<string[]> {
    const players = await this.playerRepo.find({
      where: { teamId },
      select: { userId: true },
    });
    return players.map((p) => p.userId);
  }

  /**
   * Get player user IDs for multiple teams.
   */
  async getTeamsPlayerUserIds(teamIds: string[]): Promise<string[]> {
    if (teamIds.length === 0) return [];
    const players = await this.playerRepo.find({
      where: { teamId: In(teamIds) },
      select: { userId: true },
    });
    return [...new Set(players.map((p) => p.userId))];
  }

  async updateMemberRole(
    workspaceId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
    requesterId: string,
  ): Promise<WorkspaceMember> {
    await this.ensurePermission(workspaceId, requesterId, 'member.update');

    const member = await this.memberRepo.findOne({
      where: { workspaceId, userId: targetUserId },
      relations: { user: true, role: true },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    if (member.role.slug === WorkspaceRole.OWNER) {
      throw new ForbiddenException('Cannot change the role of the workspace Owner');
    }

    const role = await this.findRoleBySlug(dto.role, workspaceId);
    if (role.slug === WorkspaceRole.OWNER) {
      throw new ForbiddenException('Cannot set a member role to Owner');
    }

    member.roleId = role.id;
    member.role = role;
    const saved = await this.memberRepo.save(member);

    // 2.6 — Notify the affected member
    const workspace = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
    await this.sendNotification(
      targetUserId,
      NotificationType.MEMBER_ROLE_CHANGED,
      `Your role in ${workspace?.name ?? 'the workspace'} has been changed to ${role.name}.`,
      workspaceId,
      { newRole: role.name, workspaceName: workspace?.name },
    );

    return saved;
  }

  async removeMember(
    workspaceId: string,
    targetUserId: string,
    requesterId: string,
  ): Promise<void> {
    await this.ensurePermission(workspaceId, requesterId, 'member.remove');

    const member = await this.memberRepo.findOne({
      where: { workspaceId, userId: targetUserId },
      relations: { role: true },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    if (member.role.slug === WorkspaceRole.OWNER) {
      throw new ForbiddenException('Cannot remove the workspace owner');
    }

    // 2.7 — Notify the removed member
    const workspace = await this.workspaceRepo.findOne({ where: { id: workspaceId } });
    await this.sendNotification(
      targetUserId,
      NotificationType.MEMBER_REMOVED,
      `You have been removed from the ${workspace?.name ?? 'workspace'} workspace.`,
      null,
      { workspaceName: workspace?.name },
    );

    await this.memberRepo.remove(member);
  }

  // ─── Roles Management ──────────────────────────────────────────────────────

  async getRoles(workspaceId: string, userId: string): Promise<Role[]> {
    await this.ensureMember(workspaceId, userId);
    return this.roleRepo.find({
      where: [
        { isSystem: true },
        { workspaceId },
      ],
      relations: { permissions: true },
      order: { isSystem: 'DESC', name: 'ASC' },
    });
  }

  async createRole(workspaceId: string, dto: CreateRoleDto, userId: string): Promise<Role> {
    await this.ensurePermission(workspaceId, userId, 'role.manage');
    const slug = this.generateSlug(dto.name);

    // check slug conflict
    const existing = await this.roleRepo.findOne({
      where: [
        { slug, workspaceId },
        { slug, isSystem: true },
      ],
    });
    if (existing) {
      throw new ConflictException(`Role with name "${dto.name}" already exists`);
    }

    const role = this.roleRepo.create({
      name: dto.name,
      slug,
      description: dto.description ?? null,
      isSystem: false,
      workspaceId,
    });
    return this.roleRepo.save(role);
  }

  async removeRole(workspaceId: string, roleId: string, userId: string): Promise<void> {
    await this.ensurePermission(workspaceId, userId, 'role.manage');
    const role = await this.roleRepo.findOne({ where: { id: roleId, workspaceId } });
    if (!role) {
      throw new NotFoundException('Role not found or is a system role');
    }

    // Check if any member has this role assigned
    const assigned = await this.memberRepo.findOne({ where: { roleId } });
    if (assigned) {
      throw new ForbiddenException('Cannot delete role as it is assigned to members');
    }

    await this.roleRepo.remove(role);
  }

  // ─── Global System Roles Management ────────────────────────────────────────

  async getGlobalRoles(): Promise<Role[]> {
    return this.roleRepo.find({
      where: { workspaceId: IsNull() },
      relations: { permissions: true },
      order: { isSystem: 'DESC', name: 'ASC' },
    });
  }

  async createGlobalRole(dto: CreateRoleDto): Promise<Role> {
    const slug = this.generateSlug(dto.name);
    const existing = await this.roleRepo.findOne({
      where: { slug, workspaceId: IsNull() },
    });
    if (existing) {
      throw new ConflictException(`Global role with name "${dto.name}" already exists`);
    }

    const role = this.roleRepo.create({
      name: dto.name,
      slug,
      description: dto.description ?? null,
      isSystem: true,
      workspaceId: null,
    });
    return this.roleRepo.save(role);
  }

  async updateGlobalRole(roleId: string, dto: UpdateRoleDto): Promise<Role> {
    const role = await this.roleRepo.findOne({ where: { id: roleId, workspaceId: IsNull() } });
    if (!role) {
      throw new NotFoundException('Global role not found');
    }

    if (dto.name && dto.name !== role.name) {
      const slug = this.generateSlug(dto.name);
      const existing = await this.roleRepo.findOne({
        where: { slug, workspaceId: IsNull() },
      });
      if (existing && existing.id !== roleId) {
        throw new ConflictException(`Global role with name "${dto.name}" already exists`);
      }
      role.name = dto.name;
      role.slug = slug;
    }

    if (dto.description !== undefined) {
      role.description = dto.description ?? null;
    }

    return this.roleRepo.save(role);
  }

  async removeGlobalRole(roleId: string): Promise<void> {
    const role = await this.roleRepo.findOne({ where: { id: roleId, workspaceId: IsNull() } });
    if (!role) {
      throw new NotFoundException('Global role not found');
    }

    // Check if any member has this role assigned
    const assigned = await this.memberRepo.findOne({ where: { roleId } });
    if (assigned) {
      throw new ForbiddenException('Cannot delete role as it is assigned to members');
    }

    await this.roleRepo.remove(role);
  }

  // ─── Global System Permissions Management ──────────────────────────────────

  async getGlobalPermissions(): Promise<Permission[]> {
    return this.permissionRepo.find({
      order: { name: 'ASC' },
    });
  }

  async createPermission(dto: CreatePermissionDto): Promise<Permission> {
    const slug = dto.slug.trim().toLowerCase().replace(/\s+/g, '.');
    const existing = await this.permissionRepo.findOne({ where: { slug } });
    if (existing) {
      throw new ConflictException(`Permission with key/slug "${slug}" already exists`);
    }

    const permission = this.permissionRepo.create({
      name: dto.name,
      slug,
      description: dto.description ?? null,
    });

    return this.permissionRepo.save(permission);
  }

  async updatePermission(permissionId: string, dto: UpdatePermissionDto): Promise<Permission> {
    const permission = await this.permissionRepo.findOne({ where: { id: permissionId } });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    if (dto.slug && dto.slug !== permission.slug) {
      const slug = dto.slug.trim().toLowerCase().replace(/\s+/g, '.');
      const existing = await this.permissionRepo.findOne({ where: { slug } });
      if (existing && existing.id !== permissionId) {
        throw new ConflictException(`Permission with key/slug "${slug}" already exists`);
      }
      permission.slug = slug;
    }

    if (dto.name !== undefined) permission.name = dto.name;
    if (dto.description !== undefined) permission.description = dto.description ?? null;

    return this.permissionRepo.save(permission);
  }

  async deletePermission(permissionId: string): Promise<void> {
    const permission = await this.permissionRepo.findOne({ where: { id: permissionId } });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    await this.permissionRepo.remove(permission);
  }

  async updateRolePermissions(roleId: string, permissionIds: string[]): Promise<Role> {
    const role = await this.roleRepo.findOne({
      where: { id: roleId },
      relations: { permissions: true },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (!permissionIds || permissionIds.length === 0) {
      role.permissions = [];
    } else {
      const permissions = await this.permissionRepo.find({
        where: permissionIds.map(id => ({ id })),
      });
      role.permissions = permissions;
    }

    return this.roleRepo.save(role);
  }

  // ─── Access Guards ────────────────────────────────────────────────────────


  async ensureMember(workspaceId: string, userId: string): Promise<WorkspaceMember> {
    const member = await this.memberRepo.findOne({
      where: { workspaceId, userId, status: 'joined' },
      relations: { role: true },
    });
    if (!member) throw new ForbiddenException('You are not a member of this workspace');
    return member;
  }

  private async ensureAdminOrOwner(workspaceId: string, userId: string): Promise<void> {
    const member = await this.ensureMember(workspaceId, userId);
    if (!MANAGEMENT_ROLES.includes(member.role.slug)) {
      throw new ForbiddenException('Only administrators and owners can perform this action');
    }
  }

  private async ensureOwner(workspaceId: string, userId: string): Promise<void> {
    const member = await this.ensureMember(workspaceId, userId);
    if (member.role.slug !== WorkspaceRole.OWNER) {
      throw new ForbiddenException('Only the workspace owner can perform this action');
    }
  }

  async ensurePermission(workspaceId: string, userId: string, permissionSlug: string): Promise<void> {
    const member = await this.memberRepo.findOne({
      where: { workspaceId, userId, status: 'joined' },
      relations: { role: { permissions: true } },
    });
    if (!member) throw new ForbiddenException('You are not a member of this workspace');
    const hasPerm = member.role?.permissions?.some(p => p.slug === permissionSlug) ?? false;
    if (!hasPerm) {
      throw new ForbiddenException(`Permission denied: requires '${permissionSlug}'`);
    }
  }



  // ─── Sports Master Data ───────────────────────────────────────────────────

  async getSports(): Promise<Sport[]> {
    return await this.sportRepo.find({ order: { name: 'ASC' } });
  }

  async createSport(dto: CreateSportDto): Promise<Sport> {
    const code = dto.code.trim().toLowerCase().replace(/\s+/g, '_');
    const existingName = await this.sportRepo.findOne({ where: { name: dto.name } });
    if (existingName) {
      throw new ConflictException(`Sport with name "${dto.name}" already exists`);
    }

    const existingCode = await this.sportRepo.findOne({ where: { code } });
    if (existingCode) {
      throw new ConflictException(`Sport with code "${code}" already exists`);
    }

    const sport = this.sportRepo.create({
      name: dto.name,
      code,
      description: dto.description ?? null,
    });

    return this.sportRepo.save(sport);
  }

  async updateSport(sportId: string, dto: UpdateSportDto): Promise<Sport> {
    const sport = await this.sportRepo.findOne({ where: { id: sportId } });
    if (!sport) {
      throw new NotFoundException('Sport not found');
    }

    if (dto.name && dto.name !== sport.name) {
      const existingName = await this.sportRepo.findOne({ where: { name: dto.name } });
      if (existingName && existingName.id !== sportId) {
        throw new ConflictException(`Sport with name "${dto.name}" already exists`);
      }
      sport.name = dto.name;
    }

    if (dto.code && dto.code !== sport.code) {
      const code = dto.code.trim().toLowerCase().replace(/\s+/g, '_');
      const existingCode = await this.sportRepo.findOne({ where: { code } });
      if (existingCode && existingCode.id !== sportId) {
        throw new ConflictException(`Sport with code "${code}" already exists`);
      }
      sport.code = code;
    }

    if (dto.description !== undefined) {
      sport.description = dto.description ?? null;
    }

    return this.sportRepo.save(sport);
  }

  async deleteSport(sportId: string): Promise<void> {
    const sport = await this.sportRepo.findOne({ where: { id: sportId } });
    if (!sport) {
      throw new NotFoundException('Sport not found');
    }

    // Check if sport is used in any competition
    const competition = await this.competitionRepo.findOne({ where: { sportId } });
    if (competition) {
      throw new ForbiddenException('Cannot delete sport as it is associated with existing competitions');
    }

    await this.sportRepo.remove(sport);
  }


  // ─── System Audit Logs & Monitoring ────────────────────────────────────────

  async logAudit(
    action: string,
    category: string = AuditCategory.SYSTEM,
    entityType?: string,
    entityId?: string,
    performedById?: string,
    performedByName?: string,
    details?: string,
    status: string = 'SUCCESS',
  ): Promise<AuditLog> {
    try {
      const log = new AuditLog();
      log.action = action;
      log.category = category;
      log.entityType = entityType ?? null as any;
      log.entityId = entityId ?? null as any;
      log.performedById = performedById ?? null as any;
      log.performedByName = performedByName ?? null as any;
      log.status = status;
      log.details = details ?? null as any;
      return await this.auditLogRepo.save(log);
    } catch (e) {
      return null as any;
    }
  }


  async getAuditLogs(category?: string, limit: number = 100): Promise<AuditLog[]> {
    const whereClause: any = {};
    if (category) {
      whereClause.category = category;
    }
    return this.auditLogRepo.find({
      where: whereClause,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async clearAuditLogs(): Promise<void> {
    await this.auditLogRepo.clear();
  }

  async getSystemMetrics(): Promise<any> {
    const uptimeSeconds = Math.floor(process.uptime());
    const memoryUsage = process.memoryUsage();

    const [
      totalUsers,
      totalWorkspaces,
      totalCompetitions,
      totalMatches,
      totalSports,
      totalAuditLogs,
    ] = await Promise.all([
      this.usersService.countAll ? this.usersService.countAll() : Promise.resolve(0),
      this.workspaceRepo.count(),
      this.competitionRepo.count(),
      this.matchRepo.count(),
      this.sportRepo.count(),
      this.auditLogRepo.count(),
    ]);

    return {
      status: 'OPERATIONAL',
      uptime: uptimeSeconds,
      uptimeFormatted: this.formatUptime(uptimeSeconds),
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapUsagePercent: `${((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(1)}%`,
      },
      counts: {
        users: totalUsers,
        workspaces: totalWorkspaces,
        competitions: totalCompetitions,
        matches: totalMatches,
        sports: totalSports,
        auditLogs: totalAuditLogs,
      },
    };
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);
    return parts.join(' ');
  }

  async getSystemConfigs(): Promise<Record<string, string>> {
    const configs = await this.systemConfigRepo.find();
    const map: Record<string, string> = {
      maintenance_mode: 'false',
      allow_registrations: 'true',
      announcement_text: '',
      announcement_level: 'info',
      max_workspaces_per_user: '10',
    };
    for (const c of configs) {
      map[c.key] = c.value;
    }
    return map;
  }

  async updateSystemConfig(key: string, value: string, userId?: string, userName?: string): Promise<Record<string, string>> {
    let config = await this.systemConfigRepo.findOne({ where: { key } });
    if (!config) {
      config = this.systemConfigRepo.create({ key, value });
    } else {
      config.value = value;
    }
    await this.systemConfigRepo.save(config);

    await this.logAudit(
      'UPDATE_SYSTEM_CONFIG',
      AuditCategory.SYSTEM,
      'SystemConfig',
      key,
      userId,
      userName,
      `Changed config "${key}" to "${value}"`,
    );

    return this.getSystemConfigs();
  }

  async getUserProfileDetails(userId: string) {
    const user = await this.usersService.findOneById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const memberships = await this.memberRepo.find({
      where: { userId, status: 'joined' },
      relations: { workspace: true, role: true },
    });

    const players = await this.playerRepo.find({
      where: { userId },
      relations: { team: true, workspace: true },
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
      workspaces: memberships.map(m => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        role: {
          slug: m.role.slug,
          name: m.role.name,
        }
      })),
      teams: players.map(p => ({
        id: p.team.id,
        name: p.team.name,
        code: p.team.code,
        logoUrl: p.team.logoUrl,
        jerseyNumber: p.jerseyNumber,
        workspace: {
          id: p.workspace.id,
          name: p.workspace.name,
        }
      }))
    };
  }
}



