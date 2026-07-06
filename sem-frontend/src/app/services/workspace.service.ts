import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  workspaceId: string | null;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}


export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: Role;
  joinedAt: string;
  user: { id: string; username: string };
}

export interface CreateWorkspacePayload {
  name: string;
  slug?: string;
  description?: string;
  logoUrl?: string;
}

export interface UpdateWorkspacePayload {
  name?: string;
  slug?: string;
  description?: string;
  logoUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private readonly apiUrl = 'http://localhost:3001/api/workspaces';

  private get headers(): HttpHeaders {
    const token = this.authService.token();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  getAll(): Observable<Workspace[]> {
    return this.http.get<Workspace[]>(this.apiUrl, { headers: this.headers });
  }

  getOne(id: string): Observable<Workspace> {
    return this.http.get<Workspace>(`${this.apiUrl}/${id}`, { headers: this.headers });
  }

  create(payload: CreateWorkspacePayload): Observable<Workspace> {
    return this.http.post<Workspace>(this.apiUrl, payload, { headers: this.headers });
  }

  update(id: string, payload: UpdateWorkspacePayload): Observable<Workspace> {
    return this.http.patch<Workspace>(`${this.apiUrl}/${id}`, payload, { headers: this.headers });
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`, { headers: this.headers });
  }

  getMembers(workspaceId: string): Observable<WorkspaceMember[]> {
    return this.http.get<WorkspaceMember[]>(`${this.apiUrl}/${workspaceId}/members`, {
      headers: this.headers,
    });
  }

  inviteMember(workspaceId: string, username: string, role: string): Observable<WorkspaceMember> {
    return this.http.post<WorkspaceMember>(
      `${this.apiUrl}/${workspaceId}/members`,
      { username, role },
      { headers: this.headers },
    );
  }

  updateMemberRole(workspaceId: string, userId: string, role: string): Observable<WorkspaceMember> {
    return this.http.patch<WorkspaceMember>(
      `${this.apiUrl}/${workspaceId}/members/${userId}`,
      { role },
      { headers: this.headers },
    );
  }

  removeMember(workspaceId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${workspaceId}/members/${userId}`, {
      headers: this.headers,
    });
  }

  // ─── Roles ────────────────────────────────────────────────────────────────

  getRoles(workspaceId: string): Observable<Role[]> {
    return this.http.get<Role[]>(`${this.apiUrl}/${workspaceId}/roles`, {
      headers: this.headers,
    });
  }

  createRole(workspaceId: string, name: string, description?: string): Observable<Role> {
    return this.http.post<Role>(
      `${this.apiUrl}/${workspaceId}/roles`,
      { name, description },
      { headers: this.headers },
    );
  }

  removeRole(workspaceId: string, roleId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${workspaceId}/roles/${roleId}`, {
      headers: this.headers,
    });
  }

  // ─── Global System Roles ──────────────────────────────────────────────────

  getGlobalRoles(): Observable<Role[]> {
    return this.http.get<Role[]>(`http://localhost:3001/api/system-settings/roles`, {
      headers: this.headers,
    });
  }

  createGlobalRole(name: string, description?: string): Observable<Role> {
    return this.http.post<Role>(
      `http://localhost:3001/api/system-settings/roles`,
      { name, description },
      { headers: this.headers },
    );
  }

  removeGlobalRole(roleId: string): Observable<void> {
    return this.http.delete<void>(`http://localhost:3001/api/system-settings/roles/${roleId}`, {
      headers: this.headers,
    });
  }

  // ─── Teams ────────────────────────────────────────────────────────────────

  getTeams(workspaceId: string): Observable<Team[]> {
    return this.http.get<Team[]>(`${this.apiUrl}/${workspaceId}/teams`, {
      headers: this.headers,
    });
  }

  createTeam(workspaceId: string, name: string, description?: string, logoUrl?: string): Observable<Team> {
    return this.http.post<Team>(
      `${this.apiUrl}/${workspaceId}/teams`,
      { name, description, logoUrl },
      { headers: this.headers },
    );
  }

  updateTeam(workspaceId: string, teamId: string, name?: string, description?: string, logoUrl?: string): Observable<Team> {
    return this.http.patch<Team>(
      `${this.apiUrl}/${workspaceId}/teams/${teamId}`,
      { name, description, logoUrl },
      { headers: this.headers },
    );
  }

  removeTeam(workspaceId: string, teamId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${workspaceId}/teams/${teamId}`, {
      headers: this.headers,
    });
  }
}
