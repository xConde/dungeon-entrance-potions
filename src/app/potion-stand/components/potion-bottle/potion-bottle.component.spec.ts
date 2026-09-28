import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PotionBottleComponent } from './potion-bottle.component';

describe('PotionBottleComponent', () => {
  let component: PotionBottleComponent;
  let fixture: ComponentFixture<PotionBottleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PotionBottleComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PotionBottleComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('bottle structure', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should render cork, neck, and body elements', () => {
      const cork = fixture.nativeElement.querySelector('.bottle-cork');
      const neck = fixture.nativeElement.querySelector('.bottle-neck');
      const body = fixture.nativeElement.querySelector('.bottle-body');

      expect(cork).toBeTruthy();
      expect(neck).toBeTruthy();
      expect(body).toBeTruthy();
    });

    it('should render liquid-fill inside body', () => {
      const liquid = fixture.nativeElement.querySelector('.bottle-body .liquid-fill');
      expect(liquid).toBeTruthy();
    });
  });

  describe('size input', () => {
    it('should apply medium size class by default', () => {
      fixture.detectChanges();
      const bottle = fixture.nativeElement.querySelector('.potion-bottle');
      expect(bottle.classList.contains('bottle-medium')).toBeTrue();
    });

    it('should apply small size class when size is small', () => {
      fixture.componentRef.setInput('size', 'small');
      fixture.detectChanges();
      const bottle = fixture.nativeElement.querySelector('.potion-bottle');
      expect(bottle.classList.contains('bottle-small')).toBeTrue();
    });

    it('should apply large size class when size is large', () => {
      fixture.componentRef.setInput('size', 'large');
      fixture.detectChanges();
      const bottle = fixture.nativeElement.querySelector('.potion-bottle');
      expect(bottle.classList.contains('bottle-large')).toBeTrue();
    });
  });

  describe('color input', () => {
    it('should apply default red color to liquid fill', () => {
      fixture.detectChanges();
      const liquid = fixture.nativeElement.querySelector('.liquid-fill');
      expect(liquid.style.background).toBe('rgb(220, 38, 38)'); // #dc2626
    });

    it('should apply custom color to liquid fill', () => {
      fixture.componentRef.setInput('color', '#ea580c');
      fixture.detectChanges();
      const liquid = fixture.nativeElement.querySelector('.liquid-fill');
      expect(liquid.style.background).toBe('rgb(234, 88, 12)'); // #ea580c
    });
  });

  describe('fillPercent input', () => {
    it('should default to 85% fill height', () => {
      fixture.detectChanges();
      const liquid = fixture.nativeElement.querySelector('.liquid-fill');
      expect(liquid.style.height).toBe('85%');
    });

    it('should apply custom fill percentage', () => {
      fixture.componentRef.setInput('fillPercent', 50);
      fixture.detectChanges();
      const liquid = fixture.nativeElement.querySelector('.liquid-fill');
      expect(liquid.style.height).toBe('50%');
    });
  });
});
