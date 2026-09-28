import { Component } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { LongPressDirective } from './long-press.directive';

@Component({
  template: `<div appLongPress (longPress)="onLongPress()">Hold me</div>`,
  standalone: true,
  imports: [LongPressDirective],
})
class TestHostComponent {
  longPressCount = 0;
  onLongPress(): void {
    this.longPressCount++;
  }
}

describe('LongPressDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    el = fixture.nativeElement.querySelector('div');
  });

  it('should create', () => {
    expect(host).toBeTruthy();
  });

  it('should emit longPress after 500ms hold', fakeAsync(() => {
    el.dispatchEvent(new TouchEvent('touchstart'));
    expect(host.longPressCount).toBe(0);

    tick(500);
    expect(host.longPressCount).toBe(1);
  }));

  it('should not emit if released before 500ms', fakeAsync(() => {
    el.dispatchEvent(new TouchEvent('touchstart'));
    tick(300);
    el.dispatchEvent(new TouchEvent('touchend'));
    tick(300);

    expect(host.longPressCount).toBe(0);
  }));

  it('should cancel on touchmove (prevents false positives during scroll)', fakeAsync(() => {
    el.dispatchEvent(new TouchEvent('touchstart'));
    tick(300);
    el.dispatchEvent(new TouchEvent('touchmove'));
    tick(300);

    expect(host.longPressCount).toBe(0);
  }));

  it('should allow re-triggering after a cancelled press', fakeAsync(() => {
    el.dispatchEvent(new TouchEvent('touchstart'));
    tick(300);
    el.dispatchEvent(new TouchEvent('touchend'));

    el.dispatchEvent(new TouchEvent('touchstart'));
    tick(500);

    expect(host.longPressCount).toBe(1);
  }));
});
