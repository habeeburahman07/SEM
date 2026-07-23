import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'avatarColor',
  standalone: true
})
export class AvatarColorPipe implements PipeTransform {
  private readonly colors = [
    '#6366f1', // Indigo
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#f59e0b', // Amber
    '#10b981', // Emerald
    '#3b82f6', // Blue
    '#ef4444', // Red
    '#14b8a6'  // Teal
  ];

  transform(name: string | null | undefined): string {
    if (!name) return '#6366f1';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return this.colors[Math.abs(hash) % this.colors.length];
  }
}
