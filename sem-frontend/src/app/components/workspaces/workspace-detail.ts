import { Component, OnInit, signal, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkspaceService, Workspace, WorkspaceMember, Role, Team } from '../../services/workspace.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-workspace-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, FormsModule],
  templateUrl: './workspace-detail.html',
  styleUrl: './workspace-detail.css',
})
export class WorkspaceDetailComponent implements OnInit {
  private workspaceService = inject(WorkspaceService);
  authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  workspace = signal<Workspace | null>(null);
  members = signal<WorkspaceMember[]>([]);
  roles = signal<Role[]>([]);
  isLoading = signal(true);
  error = signal('');
  activeTab = signal<'overview' | 'members' | 'settings' | 'teams'>('overview');

  // ── Teams State ────────────────────────────────────────────────────────────
  teams = signal<Team[]>([]);
  newTeamName = signal('');
  newTeamDescription = signal('');
  newTeamLogoUrl = signal('');
  isCreatingTeam = signal(false);
  teamCreateError = signal('');
  teamCreateSuccess = signal('');

  // Editing state for Teams
  editingTeam = signal<Team | null>(null);
  editTeamName = signal('');
  editTeamDescription = signal('');
  editTeamLogoUrl = signal('');
  isUpdatingTeam = signal(false);
  teamUpdateError = signal('');
  teamUpdateSuccess = signal('');

  // ── Workspace Edit State ───────────────────────────────────────────────────
  editName = signal('');
  editDescription = signal('');
  isSavingSettings = signal(false);
  settingsError = signal('');
  settingsSuccess = signal('');

  // ── Member Invite State ────────────────────────────────────────────────────
  inviteUsername = signal('');
  inviteRole = signal<string>('viewer');
  isInviting = signal(false);
  inviteError = signal('');
  inviteSuccess = signal('');

  // ── Role Create State ──────────────────────────────────────────────────────
  newRoleName = signal('');
  newRoleDescription = signal('');
  isCreatingRole = signal(false);
  roleCreateError = signal('');
  roleCreateSuccess = signal('');

  // ── Assignable roles for invite/member dropdown (non-owner) ───────────────
  get assignableRoles(): Role[] {
    return this.roles().filter(r => r.slug !== 'owner');
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.workspaceService.getOne(id).subscribe({
      next: (ws) => {
        this.workspace.set(ws);
        this.editName.set(ws.name);
        this.editDescription.set(ws.description ?? '');
        this.loadMembers(id);
        this.loadRoles(id);
        this.loadTeams(id);
      },
      error: (err) => {
        console.error(err);
        this.error.set('Workspace not found or access denied.');
        this.isLoading.set(false);
      },
    });
  }

  loadMembers(workspaceId: string) {
    this.workspaceService.getMembers(workspaceId).subscribe({
      next: (members) => {
        this.members.set(members);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  loadRoles(workspaceId: string) {
    this.workspaceService.getRoles(workspaceId).subscribe({
      next: (roles) => this.roles.set(roles),
      error: (err) => console.error('Failed to load roles', err),
    });
  }

  deleteWorkspace() {
    const ws = this.workspace();
    if (!ws) return;
    if (!confirm(`Are you sure you want to delete "${ws.name}"? This cannot be undone.`)) return;
    this.workspaceService.remove(ws.id).subscribe({
      next: () => this.router.navigate(['/workspaces']),
      error: (err) => alert(err.error?.message ?? 'Failed to delete workspace.'),
    });
  }

  onSaveSettings() {
    const name = this.editName().trim();
    const description = this.editDescription().trim();
    const ws = this.workspace();
    if (!ws || !name) return;

    this.isSavingSettings.set(true);
    this.settingsError.set('');
    this.settingsSuccess.set('');

    this.workspaceService.update(ws.id, { name, description }).subscribe({
      next: (updatedWs) => {
        this.isSavingSettings.set(false);
        this.workspace.set(updatedWs);
        this.settingsSuccess.set('Workspace settings updated successfully!');
      },
      error: (err) => {
        this.isSavingSettings.set(false);
        this.settingsError.set(err.error?.message ?? 'Failed to update workspace settings.');
      }
    });
  }

  isOwner(): boolean {
    return this.workspace()?.ownerId === this.authService.currentUser()?.id;
  }

  getCurrentUserRoleSlug(): string {
    const userId = this.authService.currentUser()?.id;
    return this.members().find(m => m.userId === userId)?.role?.slug ?? 'viewer';
  }

  canManageMembers(): boolean {
    const slug = this.getCurrentUserRoleSlug();
    return slug === 'owner' || slug === 'administrator';
  }

  // ── Role Helpers ────────────────────────────────────────────────────────────

  roleBadgeClass(slug: string): string {
    const map: Record<string, string> = {
      owner:               'bg-violet-500/20 text-violet-300 border-violet-500/30',
      administrator:       'bg-blue-500/20 text-blue-300 border-blue-500/30',
      event_manager:       'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      competition_manager: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      referee:             'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      statistician:        'bg-orange-500/20 text-orange-300 border-orange-500/30',
      media_team:          'bg-pink-500/20 text-pink-300 border-pink-500/30',
      viewer:              'bg-slate-700 text-slate-300 border-slate-600',
    };
    return map[slug] ?? 'bg-slate-700 text-slate-300 border-slate-600';
  }

  memberCountForRole(roleId: string): number {
    return this.members().filter(m => m.role?.id === roleId).length;
  }

  // ── Invite Member ──────────────────────────────────────────────────────────

  onInvite() {
    const username = this.inviteUsername().trim();
    const roleSlug = this.inviteRole();
    const ws = this.workspace();
    if (!ws || !username) return;

    this.isInviting.set(true);
    this.inviteError.set('');
    this.inviteSuccess.set('');

    this.workspaceService.inviteMember(ws.id, username, roleSlug).subscribe({
      next: (newMember) => {
        this.isInviting.set(false);
        this.inviteSuccess.set(`${username} has been invited successfully!`);
        this.inviteUsername.set('');
        this.members.update(prev => [...prev, newMember]);
      },
      error: (err) => {
        this.isInviting.set(false);
        this.inviteError.set(err.error?.message ?? 'Failed to invite user.');
      }
    });
  }

  // ── Update Member Role ─────────────────────────────────────────────────────

  onUpdateRole(member: WorkspaceMember, event: Event) {
    const select = event.target as HTMLSelectElement;
    const newRoleSlug = select.value;
    const ws = this.workspace();
    if (!ws) return;

    this.workspaceService.updateMemberRole(ws.id, member.userId, newRoleSlug).subscribe({
      next: (updated) => {
        this.members.update(prev => prev.map(m => m.id === member.id ? { ...m, role: updated.role } : m));
      },
      error: (err) => {
        alert(err.error?.message ?? 'Failed to update member role.');
        select.value = member.role?.slug ?? '';
      }
    });
  }

  // ── Remove Member ──────────────────────────────────────────────────────────

  onRemoveMember(member: WorkspaceMember) {
    const ws = this.workspace();
    if (!ws) return;
    if (!confirm(`Remove "${member.user.username}" from this workspace?`)) return;

    this.workspaceService.removeMember(ws.id, member.userId).subscribe({
      next: () => this.members.update(prev => prev.filter(m => m.userId !== member.userId)),
      error: (err) => alert(err.error?.message ?? 'Failed to remove member.'),
    });
  }

  // ── Create Custom Role ─────────────────────────────────────────────────────

  onCreateRole() {
    const name = this.newRoleName().trim();
    const description = this.newRoleDescription().trim();
    const ws = this.workspace();
    if (!ws || !name) return;

    this.isCreatingRole.set(true);
    this.roleCreateError.set('');
    this.roleCreateSuccess.set('');

    this.workspaceService.createRole(ws.id, name, description || undefined).subscribe({
      next: (role) => {
        this.isCreatingRole.set(false);
        this.roleCreateSuccess.set(`Role "${role.name}" created!`);
        this.newRoleName.set('');
        this.newRoleDescription.set('');
        this.roles.update(prev => [...prev, role]);
      },
      error: (err) => {
        this.isCreatingRole.set(false);
        this.roleCreateError.set(err.error?.message ?? 'Failed to create role.');
      }
    });
  }

  // ── Delete Custom Role ─────────────────────────────────────────────────────

  onDeleteRole(role: Role) {
    const ws = this.workspace();
    if (!ws) return;
    if (!confirm(`Delete the role "${role.name}"? This cannot be undone.`)) return;

    this.workspaceService.removeRole(ws.id, role.id).subscribe({
      next: () => this.roles.update(prev => prev.filter(r => r.id !== role.id)),
      error: (err) => alert(err.error?.message ?? 'Failed to delete role.'),
    });
  }

  // ── Teams CRUD ─────────────────────────────────────────────────────────────

  loadTeams(workspaceId: string) {
    this.workspaceService.getTeams(workspaceId).subscribe({
      next: (teams) => this.teams.set(teams),
      error: (err) => console.error('Failed to load teams', err),
    });
  }

  onCreateTeam() {
    const name = this.newTeamName().trim();
    const description = this.newTeamDescription().trim();
    const logoUrl = this.newTeamLogoUrl().trim();
    const ws = this.workspace();
    if (!ws || !name) return;

    this.isCreatingTeam.set(true);
    this.teamCreateError.set('');
    this.teamCreateSuccess.set('');

    this.workspaceService.createTeam(ws.id, name, description || undefined, logoUrl || undefined).subscribe({
      next: (team) => {
        this.isCreatingTeam.set(false);
        this.teamCreateSuccess.set(`Team "${team.name}" registered successfully!`);
        this.newTeamName.set('');
        this.newTeamDescription.set('');
        this.newTeamLogoUrl.set('');
        this.teams.update(prev => [...prev, team]);
      },
      error: (err) => {
        this.isCreatingTeam.set(false);
        this.teamCreateError.set(err.error?.message ?? 'Failed to create team.');
      }
    });
  }

  onEditTeam(team: Team) {
    this.editingTeam.set(team);
    this.editTeamName.set(team.name);
    this.editTeamDescription.set(team.description ?? '');
    this.editTeamLogoUrl.set(team.logoUrl ?? '');
    this.teamUpdateError.set('');
    this.teamUpdateSuccess.set('');
  }

  onCancelEditTeam() {
    this.editingTeam.set(null);
  }

  onUpdateTeam() {
    const name = this.editTeamName().trim();
    const description = this.editTeamDescription().trim();
    const logoUrl = this.editTeamLogoUrl().trim();
    const ws = this.workspace();
    const team = this.editingTeam();
    if (!ws || !team || !name) return;

    this.isUpdatingTeam.set(true);
    this.teamUpdateError.set('');
    this.teamUpdateSuccess.set('');

    this.workspaceService.updateTeam(ws.id, team.id, name, description || undefined, logoUrl || undefined).subscribe({
      next: (updated) => {
        this.isUpdatingTeam.set(false);
        this.teamUpdateSuccess.set(`Team updated successfully!`);
        this.teams.update(prev => prev.map(t => t.id === team.id ? updated : t));
        setTimeout(() => this.editingTeam.set(null), 1000);
      },
      error: (err) => {
        this.isUpdatingTeam.set(false);
        this.teamUpdateError.set(err.error?.message ?? 'Failed to update team.');
      }
    });
  }

  onDeleteTeam(team: Team) {
    const ws = this.workspace();
    if (!ws) return;
    if (!confirm(`Delete team "${team.name}"? This cannot be undone.`)) return;

    this.workspaceService.removeTeam(ws.id, team.id).subscribe({
      next: () => {
        this.teams.update(prev => prev.filter(t => t.id !== team.id));
      },
      error: (err) => {
        alert(err.error?.message ?? 'Failed to delete team.');
      }
    });
  }

  // ── Avatars ────────────────────────────────────────────────────────────────

  avatarColor(name: string): string {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
}
