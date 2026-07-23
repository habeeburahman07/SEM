import { Component, input, model, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar';

@Component({
  selector: 'app-user-dropdown',
  standalone: true,
  imports: [RouterLink, AvatarComponent],
  templateUrl: './user-dropdown.html',
})
export class UserDropdownComponent {
  isUserDropdownOpen = model<boolean>(false);
  currentUser = input.required<any>();
  userRoleSlug = input<string>('viewer');
  isUploadingAvatar = input<boolean>(false);

  signOut = output<void>();
  avatarUpload = output<Event>();

  onAvatarUpload(event: Event) {
    this.avatarUpload.emit(event);
  }
}
