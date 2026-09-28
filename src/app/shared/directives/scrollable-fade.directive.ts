import {
  AfterViewInit,
  Directive,
  ElementRef,
  inject,
  Input,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  Renderer2,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Automatically adds a fade effect and scroll indicator to scrollable containers.
 * Hides scrollbars and shows a subtle arrow when content overflows.
 *
 * Usage: Add [appScrollableFade] to any container with overflow content
 *
 * Features:
 * - Automatic fade gradient at bottom when scrollable
 * - Smart arrow sizing based on container size
 * - Auto-hides when scrolled to bottom
 * - Optional: [watchContent]="true" for dynamic lists where items are added/removed
 */
@Directive({
  selector: '[appScrollableFade]',
  standalone: true,
})
export class ScrollableFadeDirective implements OnInit, AfterViewInit, OnDestroy {
  @Input() fadeHeight = 48; // Height of fade gradient
  @Input() showArrow = true;
  @Input() bottomPadding = 20; // Bottom padding via spacer
  @Input() watchContent = false; // Enable MutationObserver for dynamic content (opt-in)
  @Input() disableSpacer = false; // Skip spacer for flex layouts where it causes gap issues

  private fadeElement?: HTMLElement;
  private arrowElement?: HTMLElement;
  private spacerElement?: HTMLElement;
  private scrollListener?: () => void;
  private resizeObserver?: ResizeObserver;
  private mutationObserver?: MutationObserver;
  private animationFrame?: number;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  constructor(
    private el: ElementRef<HTMLElement>,
    private renderer: Renderer2
  ) {}

  ngOnInit(): void {
    if (!this.isBrowser) return;
    this.setupContainer();
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    // Setup fade elements after view initialization
    setTimeout(() => {
      this.checkForPaddingBottom();
      this.createFadeElement();
      this.createArrowIndicator();
      if (!this.disableSpacer) {
        this.createSpacer();
      }
      this.setupListeners();
      this.checkScrollState();
    }, 0);
  }

  private checkForPaddingBottom(): void {
    // No longer warning about padding-bottom as we handle it with absolute positioning
    // The fade will overlay the padding area properly
  }

  ngOnDestroy(): void {
    if (this.scrollListener) {
      this.scrollListener();
    }
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
    this.fadeElement?.remove();
    this.arrowElement?.remove();
    this.spacerElement?.remove();
  }

  private setupContainer(): void {
    const element = this.el.nativeElement;

    // Ensure container has proper positioning
    const position = window.getComputedStyle(element).position;
    if (position === 'static') {
      this.renderer.setStyle(element, 'position', 'relative');
    }

    // Set overflow styles
    this.renderer.setStyle(element, 'overflow-y', 'auto');
    this.renderer.setStyle(element, 'overflow-x', 'hidden');

    // Hide scrollbar across browsers
    this.renderer.setStyle(element, 'scrollbar-width', 'none'); // Firefox
    this.renderer.setStyle(element, '-ms-overflow-style', 'none'); // IE/Edge
    this.renderer.addClass(element, 'hide-scrollbar'); // Webkit
  }

  private createSpacer(): void {
    // Remove existing if any
    this.spacerElement?.remove();

    // Find all content children (non-directive elements)
    const element = this.el.nativeElement;
    const children = Array.from(element.children);
    const contentChildren = children.filter(
      (child) =>
        !child.classList.contains('scrollable-fade-gradient') && !child.classList.contains('scrollable-arrow-indicator')
    );

    this.spacerElement = this.renderer.createElement('div') as HTMLElement;
    this.renderer.setStyle(this.spacerElement, 'height', `${this.bottomPadding}px`);
    this.renderer.setStyle(this.spacerElement, 'flex-shrink', '0');

    // Insert spacer after all content children
    if (contentChildren.length > 0) {
      const lastContent = contentChildren[contentChildren.length - 1];
      if (lastContent.nextSibling) {
        this.renderer.insertBefore(element, this.spacerElement, lastContent.nextSibling);
      } else {
        this.renderer.appendChild(element, this.spacerElement);
      }
    } else {
      // No content children, insert at beginning
      this.renderer.insertBefore(element, this.spacerElement, element.firstChild);
    }
  }

  private createFadeElement(): void {
    // Remove existing if any
    this.fadeElement?.remove();

    this.fadeElement = this.renderer.createElement('div') as HTMLElement;
    this.renderer.addClass(this.fadeElement, 'scrollable-fade-gradient');

    // Use sticky positioning to stay at bottom of viewport
    const styles = {
      position: 'sticky',
      bottom: '0',
      left: '0',
      right: '0',
      width: '100%',
      height: `${this.fadeHeight}px`,
      'min-height': `${this.fadeHeight}px`,
      'flex-shrink': '0',
      'margin-top': `-${this.fadeHeight}px`, // Pull up to overlay content
      'pointer-events': 'none',
      'z-index': '2',
      transition: 'opacity 0.2s ease',
      background: `linear-gradient(to bottom, transparent 0%, var(--text-area-color) 95%)`,
    };

    Object.entries(styles).forEach(([key, value]) => {
      this.renderer.setStyle(this.fadeElement, key, value);
    });

    this.renderer.appendChild(this.el.nativeElement, this.fadeElement);
  }

  private createArrowIndicator(): void {
    if (!this.showArrow) return;

    // Remove existing if any
    this.arrowElement?.remove();

    this.arrowElement = this.renderer.createElement('div') as HTMLElement;
    this.renderer.addClass(this.arrowElement, 'scrollable-arrow-indicator');

    // Use sticky positioning for arrow at bottom
    const arrowStyles = {
      position: 'sticky',
      bottom: '8px',
      left: '0',
      right: '0',
      width: '100%',
      'margin-top': '-32px', // Pull up to overlay with fade
      'z-index': '3',
      cursor: 'pointer',
      transition: 'opacity 0.2s ease',
      color: 'var(--text-color)',
      opacity: '0.6',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      'pointer-events': 'none',
    };

    Object.entries(arrowStyles).forEach(([key, value]) => {
      this.renderer.setStyle(this.arrowElement, key, value);
    });

    // Create arrow wrapper for pointer events
    const arrowInner = this.renderer.createElement('div') as HTMLElement;
    this.renderer.setStyle(arrowInner, 'pointer-events', 'auto');
    this.renderer.setStyle(arrowInner, 'display', 'flex');
    this.renderer.setStyle(arrowInner, 'align-items', 'center');
    this.renderer.setStyle(arrowInner, 'justify-content', 'center');

    // SECURITY: Use createElementNS instead of innerHTML for SVG
    const arrowSize = this.getArrowSize();
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('width', String(arrowSize));
    svg.setAttribute('height', String(arrowSize));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('class', 'bounce-arrow');

    const path = document.createElementNS(svgNs, 'path');
    path.setAttribute('d', 'M7 10L12 15L17 10');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');

    svg.appendChild(path);
    arrowInner.appendChild(svg);

    // Add click handler to scroll down
    this.renderer.listen(arrowInner, 'click', () => {
      const element = this.el.nativeElement;
      element.scrollBy({
        top: Math.min(200, element.clientHeight * 0.5),
        behavior: 'smooth',
      });
    });

    this.renderer.appendChild(this.arrowElement, arrowInner);
    this.renderer.appendChild(this.el.nativeElement, this.arrowElement);
  }

  private getArrowSize(): number {
    const containerHeight = this.el.nativeElement.clientHeight;

    if (containerHeight < 300) return 16;
    if (containerHeight < 500) return 20;
    return 24;
  }

  private setupListeners(): void {
    const element = this.el.nativeElement;

    // Scroll listener
    this.scrollListener = this.renderer.listen(element, 'scroll', () => {
      if (!this.animationFrame) {
        this.animationFrame = requestAnimationFrame(() => {
          this.checkScrollState();
          this.animationFrame = undefined;
        });
      }
    });

    // Resize observer for container size changes
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.checkScrollState();
      });
      this.resizeObserver.observe(element);
    }

    // MutationObserver for dynamic content (opt-in only)
    // Use [watchContent]="true" for lists where items are added/removed
    if (this.watchContent && typeof MutationObserver !== 'undefined') {
      this.mutationObserver = new MutationObserver(() => {
        if (!this.animationFrame) {
          this.animationFrame = requestAnimationFrame(() => {
            this.checkScrollState();
            this.animationFrame = undefined;
          });
        }
      });
      // Only watch direct children to avoid loops from style changes
      this.mutationObserver.observe(element, {
        childList: true,
        subtree: false,
      });
    }
  }

  private checkScrollState(): void {
    const element = this.el.nativeElement;

    // Check if scrollable
    const isScrollable = element.scrollHeight > element.clientHeight;

    if (!isScrollable) {
      this.setFadeVisibility(0);
      return;
    }

    // Calculate distance from bottom
    const scrollBottom = element.scrollTop + element.clientHeight;
    const distanceFromBottom = element.scrollHeight - scrollBottom;

    // Start fading when within fadeHeight distance from bottom
    if (distanceFromBottom <= 2) {
      // Fully at bottom
      this.setFadeVisibility(0);
    } else if (distanceFromBottom <= this.fadeHeight) {
      // Gradual fade as we approach bottom
      const opacity = distanceFromBottom / this.fadeHeight;
      this.setFadeVisibility(opacity);
    } else {
      // Fully visible when far from bottom
      this.setFadeVisibility(1);
    }
  }

  private setFadeVisibility(opacity: number): void {
    if (this.fadeElement) {
      this.renderer.setStyle(this.fadeElement, 'opacity', opacity.toString());
    }

    if (this.arrowElement) {
      const arrowInner = this.arrowElement.firstChild;
      if (arrowInner) {
        this.renderer.setStyle(arrowInner, 'opacity', (opacity * 0.6).toString()); // Arrow slightly less opaque
        this.renderer.setStyle(arrowInner, 'pointer-events', opacity > 0 ? 'auto' : 'none');
      }
    }
  }
}
