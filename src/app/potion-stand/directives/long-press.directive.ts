import { Directive, EventEmitter, HostListener, Output } from '@angular/core';

@Directive({
  selector: '[appLongPress]',
  standalone: true,
})
export class LongPressDirective {
  @Output() longPress = new EventEmitter<void>();

  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly THRESHOLD_MS = 500;

  @HostListener('touchstart', ['$event'])
  onTouchStart(_event: TouchEvent): void {
    this.pressTimer = setTimeout(() => {
      this.longPress.emit();
      this.pressTimer = null;
    }, this.THRESHOLD_MS);
  }

  @HostListener('touchend')
  @HostListener('touchmove')
  onTouchEnd(): void {
    if (this.pressTimer) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }
}
