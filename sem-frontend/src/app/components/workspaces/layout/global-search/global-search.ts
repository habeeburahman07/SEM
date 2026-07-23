import { Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Team, Player, WorkspaceEvent, Competition, Venue, WorkspaceMember } from '../../../../services/workspace.service';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar';

@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [FormsModule, AvatarComponent],
  templateUrl: './global-search.html',
})
export class GlobalSearchComponent {
  globalSearchQuery = model<string>('');
  showGlobalSearchResults = model<boolean>(false);
  
  results = input.required<{
    teams: Team[];
    players: Player[];
    events: WorkspaceEvent[];
    competitions: Competition[];
    venues: Venue[];
    members: WorkspaceMember[];
    totalCount: number;
  }>();

  selectTeam = output<Team>();
  selectPlayer = output<Player>();
  selectEvent = output<WorkspaceEvent>();
  selectCompetition = output<Competition>();
  selectVenue = output<Venue>();
  selectMember = output<WorkspaceMember>();

  clearGlobalSearch() {
    this.globalSearchQuery.set('');
    this.showGlobalSearchResults.set(false);
  }
}
