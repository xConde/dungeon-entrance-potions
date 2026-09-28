import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
export type BottleSize = 'small' | 'medium' | 'large';

@Component({
  selector: 'app-potion-bottle',
  standalone: true,
  imports: [],
  templateUrl: './potion-bottle.component.html',
  styleUrl: './potion-bottle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PotionBottleComponent {
  readonly color = input<string>('#dc2626');
  readonly size = input<BottleSize>('medium');
  readonly fillPercent = input<number>(85);

  readonly sizeClass = computed(() => `bottle-${this.size()}`);
}
