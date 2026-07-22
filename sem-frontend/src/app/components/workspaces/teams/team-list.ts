import { Component, input, output, signal, computed, effect, inject, model } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeamService } from '../../../services/team.service';
import { Team } from '../../../services/workspace.service';

@Component({
  selector: 'app-team-list',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './team-list.html',
})
export class TeamListComponent {
  private teamService = inject(TeamService);

  workspaceId = input.required<string>();
  teams = input.required<Team[]>();
  canUpdate = input<boolean>(false);
  selectedTeamId = model<string | null>(null);

  add = output<void>();
  edit = output<Team>();
  delete = output<Team>();
  teamsImported = output<Team[]>();

  teamSearchQuery = signal('');

  selectedTeamForDetails = signal<any | null>(null);
  activeTeamDetailTab = signal<'overview' | 'competitions' | 'squad'>('overview');
  isLoadingTeamStats = signal(false);

  // Bulk Import
  isBulkModalOpen = signal(false);
  bulkImportTeams = signal<any[]>([]);
  bulkImportError = signal('');
  bulkImportSuccess = signal('');
  bulkImportProgress = signal(0);
  isImportingBulk = signal(false);

  filteredTeams = computed(() => {
    const query = this.teamSearchQuery().toLowerCase().trim();
    if (!query) return this.teams();
    return this.teams().filter(t =>
      t.name.toLowerCase().includes(query) ||
      (t.code && t.code.toLowerCase().includes(query))
    );
  });

  constructor() {
    effect(() => {
      const teamId = this.selectedTeamId();
      const wsId = this.workspaceId();
      if (teamId && wsId) {
        this.loadTeamStats(wsId, teamId);
      } else {
        this.selectedTeamForDetails.set(null);
      }
    }, { allowSignalWrites: true });
  }

  loadTeamStats(workspaceId: string, teamId: string) {
    this.isLoadingTeamStats.set(true);
    this.teamService.getTeamStats(workspaceId, teamId).subscribe({
      next: (stats) => {
        this.selectedTeamForDetails.set(stats);
        this.activeTeamDetailTab.set('overview');
        this.isLoadingTeamStats.set(false);
      },
      error: (err) => {
        this.isLoadingTeamStats.set(false);
        this.selectedTeamForDetails.set(null);
        this.selectedTeamId.set(null);
        console.error('Failed to load team statistics', err);
      }
    });
  }

  onBackToTeams() {
    this.selectedTeamId.set(null);
  }

  avatarColor(name: string): string {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  initials(name: string): string {
    if (!name) return '';
    const parts = name.split(' ');
    if (parts.length > 1) {
      return parts.slice(0, 2).map(w => w[0]).join('').toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  // Bulk import actions
  openBulkModal() {
    this.bulkImportTeams.set([]);
    this.bulkImportError.set('');
    this.bulkImportSuccess.set('');
    this.bulkImportProgress.set(0);
    this.isImportingBulk.set(false);
    this.isBulkModalOpen.set(true);
  }

  closeBulkModal() {
    this.isBulkModalOpen.set(false);
    this.bulkImportTeams.set([]);
    this.bulkImportError.set('');
    this.bulkImportSuccess.set('');
    this.bulkImportProgress.set(0);
    this.isImportingBulk.set(false);
  }

  async downloadTemplate() {
    const XLSX = await import('xlsx-js-style') as any;
    const ws: any = {
      '!ref': 'A1:D3',
      'A1': { v: 'Name', t: 's', s: { font: { bold: true } } },
      'B1': { v: 'Code', t: 's', s: { font: { bold: true } } },
      'C1': { v: 'Description', t: 's', s: { font: { bold: true } } },
      'D1': { v: 'LogoUrl', t: 's', s: { font: { bold: true } } },
      'A2': { v: '#Required', t: 's', s: { font: { color: { rgb: '4B525D' } } } },
      'B2': { v: '#Required', t: 's', s: { font: { color: { rgb: '4B525D' } } } },
      'C2': { v: '#Optional', t: 's', s: { font: { color: { rgb: '4B525D' } } } },
      'D2': { v: '#Optional', t: 's', s: { font: { color: { rgb: '4B525D' } } } },
      'A3': { v: 'eg. Warriors FC', t: 's', s: { font: { italic: true } } },
      'B3': { v: 'eg. WAR', t: 's', s: { font: { italic: true } } },
      'C3': { v: 'eg. A passionate local football club.', t: 's', s: { font: { italic: true } } },
      'D3': { v: 'eg. https://example.com/logo.png', t: 's', s: { font: { italic: true } } }
    };

    ws['!cols'] = [
      { wch: 22 },
      { wch: 15 },
      { wch: 42 },
      { wch: 42 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Teams Template');
    XLSX.writeFile(wb, 'teams_import_template.xlsx');
  }

  onExcelUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const XLSX = await import('xlsx');
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet);

        const parsedTeams = json.map((row: any) => {
          const nameKey = Object.keys(row).find(k => k.toLowerCase() === 'name') || 'Name';
          const codeKey = Object.keys(row).find(k => k.toLowerCase() === 'code') || 'Code';
          const descKey = Object.keys(row).find(k => k.toLowerCase() === 'description') || 'Description';
          const logoKey = Object.keys(row).find(k => k.toLowerCase() === 'logourl' || k.toLowerCase() === 'logo') || 'LogoUrl';

          const name = (row[nameKey] || '').toString().trim();
          const code = (row[codeKey] || '').toString().trim();
          const description = (row[descKey] || '').toString().trim();
          const logoUrl = (row[logoKey] || '').toString().trim();

          let status = 'pending';
          let error = '';

          if (!name) {
            status = 'failed';
            error = 'Team Name is missing';
          } else {
            const nameExists = this.teams().some(t => t.name.toLowerCase() === name.toLowerCase());
            const codeExists = code && this.teams().some(t => t.code && t.code.toUpperCase() === code.toUpperCase());

            if (nameExists) {
              status = 'exist';
              error = 'Team Name already registered';
            } else if (codeExists) {
              status = 'exist';
              error = 'Team Code already registered';
            }
          }

          return {
            name,
            code,
            description,
            logoUrl,
            status,
            error
          };
        }).filter(t => {
          if (!t.name) return false;
          const lowerName = t.name.toLowerCase();
          if (lowerName === '#required' || lowerName === 'required') return false;
          if (lowerName.startsWith('eg.')) return false;
          if (lowerName.startsWith('eg ')) return false;
          return true;
        });

        this.bulkImportTeams.set(parsedTeams);
        this.bulkImportError.set('');
        if (parsedTeams.length === 0) {
          this.bulkImportError.set('No valid teams found in the spreadsheet. Make sure you have a "Name" column.');
        }
      } catch (err) {
        console.error('Failed to parse file', err);
        this.bulkImportError.set('Failed to parse spreadsheet. Please ensure it is a valid format.');
      }
    };
    reader.readAsArrayBuffer(file);
    input.value = '';
  }

  async onConfirmBulkImport() {
    const wsId = this.workspaceId();
    const teamsToImport = [...this.bulkImportTeams()];
    if (!wsId || teamsToImport.length === 0) return;

    this.isImportingBulk.set(true);
    this.bulkImportProgress.set(0);
    this.bulkImportError.set('');
    this.bulkImportSuccess.set('');

    let successCount = 0;
    let failCount = 0;
    let existCount = 0;

    const importedList: Team[] = [];

    for (let i = 0; i < teamsToImport.length; i++) {
      const item = teamsToImport[i];

      if (item.status === 'failed') {
        failCount++;
        this.bulkImportProgress.set(Math.round(((i + 1) / teamsToImport.length) * 100));
        continue;
      }
      if (item.status === 'exist') {
        existCount++;
        this.bulkImportProgress.set(Math.round(((i + 1) / teamsToImport.length) * 100));
        continue;
      }

      try {
        await new Promise<void>((resolve) => {
          const finalCode = item.code || item.name.substring(0, 3).toUpperCase() + Math.floor(100 + Math.random() * 900);
          this.teamService.createTeam(wsId, {
            name: item.name,
            code: finalCode,
            description: item.description || undefined,
            logoUrl: item.logoUrl || undefined
          }).subscribe({
            next: (team) => {
              importedList.push(team);
              item.status = 'success';
              item.error = '';
              successCount++;
              this.bulkImportTeams.set([...teamsToImport]);
              resolve();
            },
            error: (err) => {
              const errMsg = err.error?.message ?? 'Unknown error';
              if (errMsg.toLowerCase().includes('already registered') || errMsg.toLowerCase().includes('unique') || err.status === 409) {
                item.status = 'exist';
                item.error = 'Team Code/Name already registered';
                existCount++;
              } else {
                item.status = 'failed';
                item.error = errMsg;
                failCount++;
              }
              this.bulkImportTeams.set([...teamsToImport]);
              resolve();
            }
          });
        });
      } catch (err) {
        item.status = 'failed';
        item.error = 'Import failed';
        failCount++;
        this.bulkImportTeams.set([...teamsToImport]);
      }
      this.bulkImportProgress.set(Math.round(((i + 1) / teamsToImport.length) * 100));
    }

    this.isImportingBulk.set(false);
    if (importedList.length > 0) {
      this.teamsImported.emit(importedList);
    }

    if (failCount === 0 && existCount === 0) {
      this.bulkImportSuccess.set(`Successfully imported all ${successCount} teams!`);
    } else {
      this.bulkImportSuccess.set(`Import finished: ${successCount} successful, ${existCount} already existed, ${failCount} failed.`);
    }
  }
}
