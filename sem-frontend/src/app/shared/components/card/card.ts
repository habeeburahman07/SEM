import { Component, input, computed } from '@angular/core';

export type CardVariant = 'default' | 'elevated' | 'ghost' | 'accent';

/**
 * CardComponent
 *
 * Usage:
 *   <app-card title="Section Title" iconClass="fi-rr-star">
 *     <p>Body content</p>
 *   </app-card>
 */
@Component({
  selector: 'app-card',
  standalone: true,
  template: `
    <div [class]="cardClasses()">
      <!-- Accent gradient line (shown for 'accent' variant) -->
      @if (variant() === 'accent') {
        <div class="absolute top-0 left-0 w-full h-[2.5px] bg-gradient-to-r from-violet-500 to-indigo-500 rounded-t-2xl"></div>
      }

      <!-- Header -->
      @if (title()) {
        <div class="flex items-center justify-between border-b border-white/5 pb-4 mb-4 gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            @if (iconClass()) {
              <i [class]="'fi ' + iconClass() + ' text-violet-400 text-lg shrink-0'"></i>
            }
            <h3 class="text-sm font-bold text-white truncate">{{ title() }}</h3>
          </div>
          <!-- Actions slot -->
          <div class="shrink-0 flex items-center gap-2">
            <ng-content select="[slot=actions]" />
          </div>
        </div>
      }

      <!-- Body -->
      <ng-content />
    </div>
  `,
})
export class CardComponent {
  title      = input<string | null>(null);
  iconClass  = input<string | null>(null);
  variant    = input<CardVariant>('default');
  padding    = input<'none' | 'sm' | 'md' | 'lg'>('md');

  protected cardClasses = computed(() => {
    const base = 'rounded-2xl border relative overflow-hidden flex flex-col';

    const variants: Record<CardVariant, string> = {
      default:  'bg-slate-900 border-white/10',
      elevated: 'bg-slate-900 border-white/10 shadow-xl',
      ghost:    'bg-slate-900/40 border-white/5',
      accent:   'bg-slate-900 border-white/10 shadow-xl',
    };

    const paddings: Record<string, string> = {
      none: 'p-0',
      sm:   'p-4',
      md:   'p-6',
      lg:   'p-8',
    };

    return [base, variants[this.variant()], paddings[this.padding()]].join(' ');
  });
}
