import { Component, input, computed } from '@angular/core';

export type StatusDotColor = 'green' | 'amber' | 'rose' | 'blue' | 'slate';

/**
 * StatusDotComponent — coloured presence/status indicator dot.
 *
 * Usage:
 *   <app-status-dot color="green" [ping]="true" label="Live" />
 */
@Component({
  selector: 'app-status-dot',
  standalone: true,
  template: `
    <span class="inline-flex items-center gap-1.5">
      <span class="relative flex items-center justify-center" [style.width]="size() + 'px'" [style.height]="size() + 'px'">
        @if (ping()) {
          <span [class]="'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ' + pingColor()"></span>
        }
        <span [class]="'relative inline-flex rounded-full ' + dotColor()" [style.width]="size() + 'px'" [style.height]="size() + 'px'"></span>
      </span>
      @if (label()) {
        <span class="text-[10px] font-bold uppercase tracking-wider" [class]="labelColor()">{{ label() }}</span>
      }
    </span>
  `,
})
export class StatusDotComponent {
  color = input<StatusDotColor>('green');
  size  = input<number>(8);
  ping  = input<boolean>(false);
  label = input<string | null>(null);

  protected dotColor = computed(() => {
    const map: Record<StatusDotColor, string> = {
      green: 'bg-emerald-500',
      amber: 'bg-amber-500',
      rose:  'bg-rose-500',
      blue:  'bg-blue-500',
      slate: 'bg-slate-500',
    };
    return map[this.color()];
  });

  protected pingColor = computed(() => {
    const map: Record<StatusDotColor, string> = {
      green: 'bg-emerald-400',
      amber: 'bg-amber-400',
      rose:  'bg-rose-400',
      blue:  'bg-blue-400',
      slate: 'bg-slate-400',
    };
    return map[this.color()];
  });

  protected labelColor = computed(() => {
    const map: Record<StatusDotColor, string> = {
      green: 'text-emerald-400',
      amber: 'text-amber-400',
      rose:  'text-rose-400',
      blue:  'text-blue-400',
      slate: 'text-slate-400',
    };
    return map[this.color()];
  });
}
