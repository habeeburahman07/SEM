import { Component, input, output, ElementRef, HostListener, inject } from '@angular/core';

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
    <div role="tablist" aria-label="Tabs" class="flex items-center gap-1 p-1 bg-slate-900/60 border border-white/5 rounded-2xl overflow-x-auto">
      @for (tab of tabs(); track tab.id) {
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="activeId() === tab.id"
          [attr.aria-controls]="'panel-' + tab.id"
          [attr.id]="'tab-' + tab.id"
          [attr.tabindex]="activeId() === tab.id ? 0 : -1"
          (click)="tabChange.emit(tab.id)"
          [class]="activeId() === tab.id ? activeClass : inactiveClass"
          class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500">
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

  private elRef = inject(ElementRef);

  protected readonly activeClass   = 'bg-violet-600 text-white shadow-lg shadow-violet-900/30';
  protected readonly inactiveClass = 'text-slate-400 hover:text-white hover:bg-white/5';

  @HostListener('keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    const tabs = this.tabs();
    const activeId = this.activeId();
    const currentIndex = tabs.findIndex((t) => t.id === activeId);
    if (currentIndex === -1) return;

    let targetIndex = -1;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      targetIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      targetIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      targetIndex = 0;
    } else if (event.key === 'End') {
      targetIndex = tabs.length - 1;
    }

    if (targetIndex !== -1) {
      const targetTab = tabs[targetIndex];
      this.tabChange.emit(targetTab.id);

      setTimeout(() => {
        const el = this.elRef.nativeElement;
        const targetBtn = el.querySelector(`#tab-${targetTab.id}`) as HTMLElement;
        if (targetBtn) {
          targetBtn.focus();
        }
      }, 0);

      event.preventDefault();
    }
  }
}
