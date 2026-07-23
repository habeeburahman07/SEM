import { Component, input, output, computed } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-button',
  standalone: true,
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      [attr.aria-label]="ariaLabel() || label()"
      (click)="clicked.emit()"
      [class]="classes()">
      @if (loading()) {
        <svg class="animate-spin w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
      }
      @if (iconClass() && !loading()) {
        <i [class]="'fi ' + iconClass()"></i>
      }
      @if (label()) {
        <span>{{ label() }}</span>
      }
      <ng-content />
    </button>
  `,
})
export class ButtonComponent {
  variant  = input<ButtonVariant>('primary');
  size     = input<ButtonSize>('sm');
  label    = input<string | null>(null);
  iconClass = input<string | null>(null);
  type     = input<'button' | 'submit' | 'reset'>('button');
  disabled = input<boolean>(false);
  loading  = input<boolean>(false);
  fullWidth = input<boolean>(false);
  ariaLabel = input<string | null>(null);

  clicked = output<void>();

  protected classes = computed(() => {
    const base = 'inline-flex items-center justify-center gap-2 font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500';

    const sizes: Record<ButtonSize, string> = {
      xs: 'px-2.5 py-1 text-[10px]',
      sm: 'px-4 py-2 text-xs',
      md: 'px-5 py-2.5 text-sm',
      lg: 'px-6 py-3 text-base',
    };

    const variants: Record<ButtonVariant, string> = {
      primary:   'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/20',
      secondary: 'bg-slate-800 hover:bg-slate-700 text-white border border-white/10',
      danger:    'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/20',
      ghost:     'bg-transparent hover:bg-white/5 text-slate-300 hover:text-white',
      outline:   'bg-transparent border border-violet-500/40 hover:border-violet-500 text-violet-400 hover:text-white hover:bg-violet-500/10',
    };

    const width = this.fullWidth() ? 'w-full' : '';

    return [base, sizes[this.size()], variants[this.variant()], width].join(' ');
  });
}
