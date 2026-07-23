import { Component, input, output } from '@angular/core';

export interface TabItem {
  id: string;
  label: string;
  iconClass?: string;
  badge?: string | number;
}

/**
 * TabBarComponent — horizontal tab navigation.
 *
 * Usage:
 *   <app-tab-bar [tabs]="tabs" [activeId]="activeTab()" (tabChange)="activeTab.set($event)" />
 */
@Component({
  selector: 'app-tab-bar',
  standalone: true,
  template: `
    <div class="flex items-center gap-1 p-1 bg-slate-900/60 border border-white/5 rounded-2xl overflow-x-auto">
      @for (tab of tabs(); track tab.id) {
        <button
          type="button"
          (click)="tabChange.emit(tab.id)"
          [class]="activeId() === tab.id ? activeClass : inactiveClass"
          class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border-0">
          @if (tab.iconClass) {
            <i [class]="'fi ' + tab.iconClass + ' text-sm'"></i>
          }
          {{ tab.label }}
          @if (tab.badge !== undefined && tab.badge !== null) {
            <span class="px-1.5 py-0.5 rounded-md text-[9px] font-bold"
              [class]="activeId() === tab.id ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'">
              {{ tab.badge }}
            </span>
          }
        </button>
      }
    </div>
  `,
})
export class TabBarComponent {
  tabs     = input.required<TabItem[]>();
  activeId = input.required<string>();

  tabChange = output<string>();

  protected readonly activeClass   = 'bg-violet-600 text-white shadow-lg shadow-violet-900/30';
  protected readonly inactiveClass = 'text-slate-400 hover:text-white hover:bg-white/5';
}
