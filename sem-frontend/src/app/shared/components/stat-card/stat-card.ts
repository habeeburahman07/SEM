import { Component, input, computed } from '@angular/core';

export type StatCardTheme = 'violet' | 'emerald' | 'amber' | 'rose' | 'blue' | 'slate';

/**
 * StatCardComponent — dashboard KPI tile.
 *
 * Usage:
 *   <app-stat-card label="Appearances" [value]="42" iconClass="fi-rr-calendar" theme="violet" />
 */
@Component({
  selector: 'app-stat-card',
  standalone: true,
  template: `
    <div class="bg-slate-900 border border-white/10 p-4 rounded-2xl flex flex-col gap-1.5 text-left relative overflow-hidden">
      <!-- Background accent glow -->
      <div class="absolute -right-4 -bottom-4 w-20 h-20 rounded-full opacity-10 blur-2xl" [class]="glowClass()"></div>

      <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
        @if (iconClass()) {
          <i [class]="'fi ' + iconClass() + ' ' + iconColor()"></i>
        }
        {{ label() }}
      </span>

      <span class="text-2xl font-black" [class]="valueColor()">
        {{ prefix() }}{{ displayValue() }}{{ suffix() }}
      </span>

      @if (subLabel()) {
        <span class="text-[10px] text-slate-500">{{ subLabel() }}</span>
      }
    </div>
  `,
})
export class StatCardComponent {
  label    = input.required<string>();
  value    = input<number | string | null>(null);
  subLabel = input<string | null>(null);
  iconClass = input<string | null>(null);
  theme    = input<StatCardTheme>('violet');
  prefix   = input<string>('');
  suffix   = input<string>('');
  decimals = input<number>(0);

  protected displayValue = computed(() => {
    const v = this.value();
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number' && this.decimals() > 0) return v.toFixed(this.decimals());
    return String(v);
  });

  protected valueColor = computed(() => {
    const map: Record<StatCardTheme, string> = {
      violet:  'text-violet-400',
      emerald: 'text-emerald-400',
      amber:   'text-yellow-400',
      rose:    'text-rose-400',
      blue:    'text-blue-400',
      slate:   'text-white',
    };
    return map[this.theme()];
  });

  protected iconColor = computed(() => {
    const map: Record<StatCardTheme, string> = {
      violet:  'text-violet-500',
      emerald: 'text-emerald-500',
      amber:   'text-yellow-500',
      rose:    'text-rose-500',
      blue:    'text-blue-500',
      slate:   'text-slate-400',
    };
    return map[this.theme()];
  });

  protected glowClass = computed(() => {
    const map: Record<StatCardTheme, string> = {
      violet:  'bg-violet-500',
      emerald: 'bg-emerald-500',
      amber:   'bg-amber-500',
      rose:    'bg-rose-500',
      blue:    'bg-blue-500',
      slate:   'bg-slate-500',
    };
    return map[this.theme()];
  });
}
