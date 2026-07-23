import { Component, input, output } from '@angular/core';

/**
 * SearchInputComponent — a styled search box with clear button.
 *
 * Usage:
 *   <app-search-input
 *     [value]="query()"
 *     placeholder="Search players..."
 *     (valueChange)="query.set($event)" />
 */
@Component({
  selector: 'app-search-input',
  standalone: true,
  template: `
    <div class="relative" [class]="fullWidth() ? 'w-full' : 'w-72'">
      <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
        <i class="fi fi-rr-search text-xs"></i>
      </span>
      <input
        type="text"
        [value]="value()"
        [placeholder]="placeholder()"
        (input)="onInput($event)"
        class="w-full bg-slate-950/40 border border-white/10 focus:border-violet-500/50 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none transition-all" />
      @if (value()) {
        <button
          (click)="valueChange.emit('')"
          class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 cursor-pointer bg-transparent border-0">
          <i class="fi fi-rr-cross text-[10px]"></i>
        </button>
      }
    </div>
  `,
})
export class SearchInputComponent {
  value       = input<string>('');
  placeholder = input<string>('Search...');
  fullWidth   = input<boolean>(false);

  valueChange = output<string>();

  protected onInput(e: Event) {
    this.valueChange.emit((e.target as HTMLInputElement).value);
  }
}
