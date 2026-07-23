import { TestBed, ComponentFixture } from '@angular/core/testing';
import { TabBarComponent, TabItem } from './tab-bar';
import { Component, signal } from '@angular/core';

@Component({
  standalone: true,
  imports: [TabBarComponent],
  template: `
    <app-tab-bar [tabs]="tabs" [activeId]="activeTab()" (tabChange)="activeTab.set($event)" />
  `
})
class TestHostComponent {
  tabs: TabItem[] = [
    { id: 't1', label: 'Tab 1' },
    { id: 't2', label: 'Tab 2' },
    { id: 't3', label: 'Tab 3' }
  ];
  activeTab = signal<string>('t1');
}

describe('TabBarComponent', () => {
  let hostComponent: TestHostComponent;
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent, TabBarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    hostComponent = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should render roles correctly', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const tablist = compiled.querySelector('[role="tablist"]');
    expect(tablist).toBeTruthy();

    const tabs = compiled.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(3);

    // Tab 1 is active
    const tab1 = tabs[0] as HTMLButtonElement;
    expect(tab1.getAttribute('aria-selected')).toBe('true');
    expect(tab1.getAttribute('tabindex')).toBe('0');

    // Tab 2 is inactive
    const tab2 = tabs[1] as HTMLButtonElement;
    expect(tab2.getAttribute('aria-selected')).toBe('false');
    expect(tab2.getAttribute('tabindex')).toBe('-1');
  });

  it('should support ArrowRight and ArrowLeft key navigation', async () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const tab1 = compiled.querySelector('#tab-t1') as HTMLButtonElement;

    // Trigger ArrowRight keydown
    const rightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
    tab1.dispatchEvent(rightEvent);
    fixture.detectChanges();

    expect(hostComponent.activeTab()).toBe('t2');

    // Trigger ArrowLeft keydown
    const tab2 = compiled.querySelector('#tab-t2') as HTMLButtonElement;
    const leftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
    tab2.dispatchEvent(leftEvent);
    fixture.detectChanges();

    expect(hostComponent.activeTab()).toBe('t1');
  });

  it('should support Home and End key navigation', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const tab1 = compiled.querySelector('#tab-t1') as HTMLButtonElement;

    // Trigger End keydown
    const endEvent = new KeyboardEvent('keydown', { key: 'End', bubbles: true });
    tab1.dispatchEvent(endEvent);
    fixture.detectChanges();

    expect(hostComponent.activeTab()).toBe('t3');

    const tab3 = compiled.querySelector('#tab-t3') as HTMLButtonElement;
    // Trigger Home keydown
    const homeEvent = new KeyboardEvent('keydown', { key: 'Home', bubbles: true });
    tab3.dispatchEvent(homeEvent);
    fixture.detectChanges();

    expect(hostComponent.activeTab()).toBe('t1');
  });
});
