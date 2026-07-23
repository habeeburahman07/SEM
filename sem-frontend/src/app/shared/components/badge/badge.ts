import { Component, input, computed } from '@angular/core';

export type BadgeVariant =
  | 'violet' | 'emerald' | 'amber' | 'rose' | 'blue' | 'slate' | 'orange';

export type BadgeSize = 'xs' | 'sm' | 'md';

/**
 * BadgeComponent — small, pill-shaped label.
 *
 * Usage:
 *   <app-badge label="Live" variant="rose" iconClass="fi-rr-bolt" dot />
 */
@Component({
  selector: 'app-badge',
  standalone: true,
  template: `
    <span [class]="classes()">
      @if (dot()) {
        <span [class]="dotClass()"></span>
      }
      @if (iconClass()) {
        <i [class]="'fi ' + iconClass()"></i>
      }
      @if (label()) {
        {{ label() }}
      }
      <ng-content />
    </span>
  `,
})
export class BadgeComponent {
  label     = input<string | null>(null);
  variant   = input<BadgeVariant>('violet');
  size      = input<BadgeSize>('sm');
  iconClass = input<string | null>(null);
  dot       = input<boolean>(false);
  pulse     = input<boolean>(false);

  protected classes = computed(() => {
    const base = 'inline-flex items-center gap-1 font-bold rounded-full uppercase tracking-wider';

    const sizes: Record<BadgeSize, string> = {
      xs: 'px-1.5 py-0.5 text-[8px]',
      sm: 'px-2 py-0.5 text-[9px]',
      md: 'px-2.5 py-1 text-[10px]',
    };

    const variants: Record<BadgeVariant, string> = {
      violet:  'bg-violet-500/15 border border-violet-500/30 text-violet-300',
      emerald: 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300',
      amber:   'bg-amber-500/15 border border-amber-500/30 text-amber-300',
      rose:    'bg-rose-500/15 border border-rose-500/30 text-rose-300',
      blue:    'bg-blue-500/15 border border-blue-500/30 text-blue-300',
      slate:   'bg-slate-700 border border-white/10 text-slate-300',
      orange:  'bg-orange-500/15 border border-orange-500/30 text-orange-300',
    };

    return [base, sizes[this.size()], variants[this.variant()]].join(' ');
  });

  protected dotClass = computed(() => {
    const variantDot: Record<BadgeVariant, string> = {
      violet:  'w-1.5 h-1.5 rounded-full bg-violet-400',
      emerald: 'w-1.5 h-1.5 rounded-full bg-emerald-400',
      amber:   'w-1.5 h-1.5 rounded-full bg-amber-400',
      rose:    'w-1.5 h-1.5 rounded-full bg-rose-400',
      blue:    'w-1.5 h-1.5 rounded-full bg-blue-400',
      slate:   'w-1.5 h-1.5 rounded-full bg-slate-400',
      orange:  'w-1.5 h-1.5 rounded-full bg-orange-400',
    };
    const base = variantDot[this.variant()];
    return this.pulse() ? base + ' animate-pulse' : base;
  });
}
