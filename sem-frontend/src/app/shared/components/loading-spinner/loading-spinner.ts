import { Component, input } from '@angular/core';

/**
 * LoadingSpinnerComponent — animated loading indicator.
 *
 * Usage:
 *   <app-loading-spinner />
 *   <app-loading-spinner message="Loading players..." [fullPage]="true" />
 */
@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  template: `
    <div [class]="fullPage() ? 'flex flex-col items-center justify-center min-h-[400px] w-full gap-4' : 'flex flex-col items-center justify-center gap-3 py-10'">
      <svg class="animate-spin text-violet-500" [class]="sizeClass()" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      @if (message()) {
        <p class="text-xs text-slate-400">{{ message() }}</p>
      }
    </div>
  `,
})
export class LoadingSpinnerComponent {
  message  = input<string | null>(null);
  size     = input<'sm' | 'md' | 'lg'>('md');
  fullPage = input<boolean>(false);

  protected sizeClass() {
    return { sm: 'w-5 h-5', md: 'w-8 h-8', lg: 'w-12 h-12' }[this.size()];
  }
}
