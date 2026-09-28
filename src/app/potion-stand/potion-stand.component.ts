import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ScrollLockService } from '@services/scroll-lock.service';
import { FocusTrapDirective } from '@shared/directives/focus-trap.directive';
import { ShellGameComponent } from './components/shell-game/shell-game.component';
import { DaySummaryModalComponent } from './components/day-summary-modal/day-summary-modal.component';
import { GameOverModalComponent } from './components/game-over-modal/game-over-modal.component';
import { GameHeaderComponent } from './components/game-header/game-header.component';
import { CustomerQueueComponent } from './components/customer-queue/customer-queue.component';
import { MerchantWaresComponent } from './components/merchant-wares/merchant-wares.component';
import { MerchantInventoryComponent } from './components/merchant-inventory/merchant-inventory.component';
import { DungeonActivityComponent } from './components/dungeon-activity/dungeon-activity.component';
import { MerchantTipsComponent } from './components/merchant-tips/merchant-tips.component';
import { PotionShopComponent, SellPotionEvent } from './components/potion-shop/potion-shop.component';
import { GameStateService } from './services/game-state.service';
import { GameLoopService } from './services/game-loop.service';
import { ShopService } from './services/shop.service';
import { AdventurerService } from './services/adventurer.service';
import { PotionCraftingService } from './services/potion-crafting.service';
import { DungeonSimulationService } from './services/dungeon-simulation.service';
import { GameRngService } from './services/game-rng.service';
import { GamePhase, GamePhaseService } from './services/game-phase.service';
import { GameEventBusService } from './services/game-event-bus.service';
import { EconomyService } from './services/economy.service';
import { GameOrchestratorService } from './services/game-orchestrator.service';
import { AudioService } from './services/audio.service';
import { Adventurer, AdventurerClass, DeathNotification } from './models/adventurer.model';
import { Potion, PotionEffects } from './models/potion.model';
import { CustomerReview, DungeonEvent } from './models/game-state.model';
import {
  CloseDayPreview,
  DaySummaryData,
  GameOverReason,
  GameOverStats,
  MerchantInventory,
  MerchantPotionType,
  PotionForecast,
  PotionType,
  PriceMode,
  PurchaseAnimation,
  ShellGameReward,
} from './potion-stand.model';
import { getClassIcon, getIcon } from './utils/icons';
import { GUILT, REPUTATION, TIMING, UPGRADES } from './config/game-config';

@Component({
  selector: 'app-potion-stand',
  templateUrl: './potion-stand.component.html',
  styleUrls: ['./potion-stand.component.scss'],
  standalone: true,
  imports: [
    ShellGameComponent,
    DaySummaryModalComponent,
    GameOverModalComponent,
    GameHeaderComponent,
    CustomerQueueComponent,
    MerchantWaresComponent,
    MerchantInventoryComponent,
    DungeonActivityComponent,
    MerchantTipsComponent,
    PotionShopComponent,
    FocusTrapDirective,
  ],
  providers: [
    GameRngService,
    GameStateService,
    GameLoopService,
    GamePhaseService,
    ShopService,
    AdventurerService,
    PotionCraftingService,
    DungeonSimulationService,
    GameEventBusService,
    EconomyService,
    GameOrchestratorService,
    AudioService,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PotionStandComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('dungeonLog', { static: false }) dungeonLogRef!: ElementRef<HTMLDivElement>;
  @ViewChild(ShellGameComponent) shellGame?: ShellGameComponent;
  @ViewChild(PotionShopComponent) potionShop?: PotionShopComponent;
  @ViewChild('messageToast') private messageToastRef?: ElementRef<HTMLElement>;

  // Keyboard controls
  readonly showHelpOverlay = signal(false);
  readonly priceMode = signal<PriceMode>('fair');
  readonly dilutionBenchOpen = signal(false);
  readonly closeDayConfirmationOpen = signal(false);
  private resumeAfterDilutionBench = false;
  private resumeAfterCloseDayConfirmation = false;

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
    if (this.closeDayConfirmationOpen()) {
      this.cancelCloseDay();
      event.preventDefault();
      return;
    }
    if (this.dilutionBenchOpen()) {
      this.potionShop?.cancelDilutionBench();
      event.preventDefault();
      return;
    }
    if (this.potionShop?.cancelInlineDilutionConfirmation()) {
      event.preventDefault();
      return;
    }
    if (this.showHelpOverlay()) {
      this.showHelpOverlay.set(false);
      event.preventDefault();
      return;
    }
    if (this.gamePhase === 'playing') {
      event.preventDefault();
      this.togglePause();
      this.bumpState();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    // Ignore if focused on input/textarea
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    // Ignore when modals are open (focus trap takes precedence)
    if (
      this.dilutionBenchOpen() ||
      this.closeDayConfirmationOpen() ||
      this.gamePhase === 'day-summary' ||
      this.gamePhase === 'game-over'
    )
      return;

    // Ignore modifier keys (don't bind Ctrl+*, Alt+*)
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    switch (event.key) {
      // Game controls
      case 'p':
      case 'P':
        this.togglePause();
        this.bumpState();
        event.preventDefault();
        break;
      case 's':
      case 'S':
        this.changeSpeed();
        this.bumpState();
        event.preventDefault();
        break;
      case 'm':
      case 'M':
        this.toggleAudio();
        event.preventDefault();
        break;

      // Potion selection (1-5 keys sell to selected customer)
      case '1':
      case '2':
      case '3':
      case '4':
      case '5': {
        if (this.gamePhase !== 'playing' || !this.selectedAdventurer) break;
        const potionIndex = parseInt(event.key) - 1;
        const potions = this.availablePotions.filter((p) => (this.potionInventory.get(p.id) ?? 0) > 0);
        if (potionIndex < potions.length) {
          this.orchestrator.sellPotion(potions[potionIndex], this.selectedAdventurer, this.priceMode());
          event.preventDefault();
        }
        break;
      }

      // Customer selection (Q/W/E/R/T)
      case 'q':
      case 'Q':
      case 'w':
      case 'W':
      case 'e':
      case 'E':
      case 'r':
      case 'R':
      case 't':
      case 'T': {
        if (this.gamePhase !== 'playing') break;
        const customerKeys = ['q', 'w', 'e', 'r', 't'];
        const idx = customerKeys.indexOf(event.key.toLowerCase());
        if (idx >= 0 && idx < this.shop.adventurersInShop.length) {
          this.selectAdventurer(this.shop.adventurersInShop[idx]);
          event.preventDefault();
        }
        break;
      }

      // Space to sell recommended potion
      case ' ': {
        if (this.gamePhase !== 'playing' || !this.selectedAdventurer) break;
        const recommended = this.orchestrator.getRecommendedPotion(this.selectedAdventurer, this.priceMode());
        if (recommended && (this.potionInventory.get(recommended.id) ?? 0) > 0) {
          this.orchestrator.sellPotion(recommended, this.selectedAdventurer, this.priceMode());
        }
        event.preventDefault();
        break;
      }

      // ? for help overlay
      case '?':
        this.showHelpOverlay.update((v) => !v);
        event.preventDefault();
        break;
    }
  }

  // Injected services
  private readonly destroyRef = inject(DestroyRef);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly scrollLock = inject(ScrollLockService);
  readonly orchestrator = inject(GameOrchestratorService);
  readonly economy = inject(EconomyService);
  private readonly gameLoop = inject(GameLoopService);
  private readonly gamePhaseService = inject(GamePhaseService);
  readonly shop = inject(ShopService);
  readonly audio = inject(AudioService);
  private readonly gameStateService = inject(GameStateService);

  /** Cross-tab save conflict signal — surfaced as a banner in the template. */
  readonly crossTabConflict = this.gameStateService.crossTabConflict;

  /** Reload the page to pick up the save written by another tab. */
  reloadForLatestSave(): void {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }

  // Cached sanitized SVG icons (avoid re-sanitizing on every change detection)
  readonly deathIconSvg: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(getIcon('skull'));

  /**
   * OnPush nudge: orchestrator + economy + shop + audio expose state via getters,
   * not signals. We bump this signal whenever state changes (RxJS subscriptions or
   * keyboard handlers that mutate service state) and the template root reads it
   * via `[attr.data-state-tick]`. This is the same pattern shipped in
   * pipeline-panic Phase 1f.
   */
  private readonly stateTick = signal(0);
  readonly stateTickAttr = this.stateTick.asReadonly();
  private bumpState(): void {
    this.stateTick.update((n) => n + 1);
  }

  /**
   * Red-team fix A (WS2a): `@if` keeps the same .message-bar DOM node across
   * a message replacement (currentMessage flips to a NEW object while
   * already truthy), so without this, the CSS entrance/exit keyframe below
   * keeps running on its ORIGINAL clock — a replacement message could fade
   * out and vanish in well under a second while its own 5s timer is still
   * counting. Restarting the CSS animation via a forced reflow gets each
   * message its own fresh clock without recreating the node (a keyed @for
   * would do that too, but trips Angular's NG0956 "track by identity caused
   * recreation" advisory on every single message swap — rejected for that
   * reason during the initial WS2a build).
   * No-ops on first mount (insertion already runs the animation) and on
   * clear (nothing to restart). Also no-ops under prefers-reduced-motion:
   * the CSS carve-out in _responsive.scss disables the animation with
   * !important regardless, so forcing a reflow would be wasted work.
   * Runs synchronously (no rAF/microtask deferral): the `!previous` guard
   * below means we only ever reach the reflow when the toast was ALREADY
   * mounted showing the prior message, so messageToastRef is already live —
   * there's no "wait for the new text to paint first" ordering to manage.
   *
   * Owner redo (2026-08-17): playing phase renders its own in-flow toast
   * inside PotionShopComponent (see that Input's doc comment) instead of this
   * page-level fixed one, so the reflow needs to target whichever element is
   * actually mounted for the current phase.
   */
  private lastAnimatedMessage: { text: string; type: 'info' | 'success' | 'warning' | 'error' } | null = null;
  private restartMessageToastAnimation(): void {
    const next = this.orchestrator.currentMessage;
    if (next === this.lastAnimatedMessage) return;
    const previous = this.lastAnimatedMessage;
    this.lastAnimatedMessage = next;
    if (!next || !previous) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;

    if (this.gamePhase === 'playing') {
      this.potionShop?.restartToastAnimation();
      return;
    }

    const el = this.messageToastRef?.nativeElement;
    if (!el) return;
    el.style.animation = 'none';
    void el.offsetWidth; // force reflow so the browser re-arms the keyframe
    el.style.animation = '';
  }

  // ---------------------------------------------------------------------------
  // Delegated state getters — keep template bindings identical
  // ---------------------------------------------------------------------------

  get day(): number {
    return this.orchestrator.day;
  }
  set day(v: number) {
    this.orchestrator.day = v;
  }
  get timeOfDay(): 'Morning' | 'Afternoon' | 'Evening' | 'Night' {
    return this.orchestrator.timeOfDay;
  }
  set timeOfDay(v: 'Morning' | 'Afternoon' | 'Evening' | 'Night') {
    this.orchestrator.timeOfDay = v;
  }
  get gameTime(): number {
    return this.orchestrator.gameTime;
  }
  set gameTime(v: number) {
    this.orchestrator.gameTime = v;
  }
  get potionInventory(): Map<string, number> {
    return this.orchestrator.potionInventory;
  }
  get availablePotions(): Potion[] {
    return this.orchestrator.availablePotions;
  }
  get potionUpgrades(): Record<string, number> {
    return this.orchestrator.potionUpgrades;
  }
  set potionUpgrades(v: Record<string, number>) {
    this.orchestrator.potionUpgrades = v;
  }
  get adventurersInDungeon(): Adventurer[] {
    return this.orchestrator.adventurersInDungeon;
  }
  get dungeonEvents(): DungeonEvent[] {
    return this.orchestrator.dungeonEvents;
  }
  get customerReviews(): CustomerReview[] {
    return this.orchestrator.customerReviews;
  }
  get emergencyPrices(): Map<string, number> {
    return this.orchestrator.emergencyPrices;
  }
  get currentEvent(): { title: string; description: string; icon: string } | null {
    return this.orchestrator.currentEvent;
  }
  get showDeathModal(): boolean {
    return this.orchestrator.showDeathModal;
  }
  get recentDeath(): DeathNotification | null {
    return this.orchestrator.recentDeath;
  }
  get daySummaryData(): DaySummaryData | null {
    return this.orchestrator.daySummaryData;
  }
  get gameOverReason(): GameOverReason | null {
    return this.orchestrator.gameOverReason;
  }
  get purchaseAnimation(): PurchaseAnimation | null {
    return this.orchestrator.purchaseAnimation;
  }
  get comboSignal(): { name: string } | null {
    return this.orchestrator.comboSignal;
  }
  get showFullNamesInLog(): boolean {
    return this.orchestrator.showFullNamesInLog;
  }
  get hasSeenDilutionRitual(): boolean {
    return this.orchestrator.hasSeenDilutionRitual;
  }
  get currentMessage(): { text: string; type: 'info' | 'success' | 'warning' | 'error' } | null {
    return this.orchestrator.currentMessage;
  }
  get marketTicker(): { message: string; active: boolean; priceTrend: 'up' | 'down' | 'stable' | null } {
    return this.orchestrator.marketTicker;
  }

  /**
   * Sanitized SVG for the current market ticker's trend, if any. Phosphor
   * trend-up / trend-down / chart-line — rendered via [innerHTML] so the
   * ticker shows a real glyph instead of a colour-emoji.
   */
  readonly trendUpIcon: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(getIcon('trend-up'));
  readonly trendDownIcon: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(getIcon('trend-down'));
  readonly chartLineIcon: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(getIcon('chart-line'));
  get hasStock(): boolean {
    return this.orchestrator.hasStock;
  }
  get canAffordPotions(): boolean {
    return this.orchestrator.canAffordPotions;
  }
  get activeAdventurersInDungeon(): Adventurer[] {
    return this.orchestrator.activeAdventurersInDungeon;
  }
  get hasDungeonDanger(): boolean {
    return this.activeAdventurersInDungeon.some((a) => a.maxHp > 0 && a.currentHp / a.maxHp < 0.3);
  }
  get closeDayPreview(): CloseDayPreview {
    return this.orchestrator.getCloseDayPreview();
  }
  get DAILY_OVERHEAD(): number {
    return this.orchestrator.DAILY_OVERHEAD;
  }
  get gameOverStats(): GameOverStats {
    return this.orchestrator.gameOverStats;
  }
  get UPGRADE_COSTS(): Readonly<Record<string, readonly number[]>> {
    return this.orchestrator.UPGRADE_COSTS;
  }
  get TIER_NAMES(): readonly string[] {
    return this.orchestrator.TIER_NAMES;
  }
  readonly TIER_MULTIPLIERS = UPGRADES.TIER_MULTIPLIERS;
  readonly RESTOCK_COST = this.orchestrator.RESTOCK_COST;
  get stormActive(): boolean {
    return this.orchestrator.stormActive;
  }
  set stormActive(v: boolean) {
    this.orchestrator.stormActive = v;
  }
  get dragonActive(): boolean {
    return this.orchestrator.dragonActive;
  }
  set dragonActive(v: boolean) {
    this.orchestrator.dragonActive = v;
  }
  get potionShortageActive(): boolean {
    return this.orchestrator.potionShortageActive;
  }
  set potionShortageActive(v: boolean) {
    this.orchestrator.potionShortageActive = v;
  }
  get tutorialStep(): number {
    return this.orchestrator.tutorialStep;
  }
  get tutorialComplete(): boolean {
    return this.orchestrator.tutorialComplete;
  }

  // Economy state exposed via getters for template backward-compatibility
  get gold(): number {
    return this.economy.gold;
  }
  get reputation(): number {
    return this.economy.reputation;
  }
  get dailyProfit(): number {
    return this.economy.dailyProfit;
  }
  get dailyExpenses(): number {
    return this.economy.dailyExpenses;
  }
  get dailyDeaths(): number {
    return this.economy.dailyDeaths;
  }
  get dailySaves(): number {
    return this.economy.dailySaves;
  }
  get deathCount(): number {
    return this.economy.deathCount;
  }
  get savedCount(): number {
    return this.economy.savedCount;
  }
  get goldEarned(): number {
    return this.economy.goldEarned;
  }
  get potionsSold(): number {
    return this.economy.potionsSold;
  }
  get guilt(): number {
    return this.economy.guilt;
  }
  get maxGuilt(): number {
    return this.economy.maxGuilt;
  }
  get dungeonDifficulty(): number {
    return this.economy.dungeonDifficulty;
  }
  get currentFloor(): number {
    return this.economy.currentFloor;
  }

  // Mobile tab navigation state
  readonly mobileActiveTab = signal<'customers' | 'potions' | 'dungeon'>('customers');
  private mobileTabTimers: ReturnType<typeof setTimeout>[] = [];

  setMobileTab(tab: 'customers' | 'potions' | 'dungeon'): void {
    this.mobileActiveTab.set(tab);
  }

  /** ARIA tablist keyboard nav: ArrowLeft/ArrowRight cycle tabs and move focus.
   *  Only active when the mobile tab bar is visible (< 768px). */
  onMobileTabKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    // Only handle when the tablist is actually visible on mobile
    if (!this.isMobileViewport()) return;
    const tabs: Array<'customers' | 'potions' | 'dungeon'> = ['customers', 'potions', 'dungeon'];
    const currentIdx = tabs.indexOf(this.mobileActiveTab());
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const nextIdx = (currentIdx + delta + tabs.length) % tabs.length;
    this.setMobileTab(tabs[nextIdx]);
    event.preventDefault();
    // Move DOM focus to the newly-active tab button
    const tabEl = document.getElementById(`tab-${tabs[nextIdx]}`);
    tabEl?.focus();
  }

  /** Ensure mobile tab is valid (defensive — narrowed type guarantees this) */
  private syncMobileTabWithPhase(): void {
    const current = this.mobileActiveTab();
    if (current !== 'customers' && current !== 'potions' && current !== 'dungeon') {
      this.mobileActiveTab.set('customers');
    }
  }

  // Game phase/loop getters
  get gamePhase(): GamePhase {
    return this.gamePhaseService.currentPhase();
  }
  get isPaused(): boolean {
    return this.gameLoop.isPaused;
  }
  get gameSpeed(): number {
    return this.gameLoop.gameSpeed;
  }

  // Shop getters
  get selectedAdventurer(): Adventurer | null {
    return this.shop.selectedAdventurer;
  }
  set selectedAdventurer(v: Adventurer | null) {
    this.shop.selectedAdventurer = v;
  }
  get adventurersInShop(): Adventurer[] {
    return this.shop.adventurersInShop;
  }
  set adventurersInShop(v: Adventurer[]) {
    this.shop.adventurersInShop = v;
  }
  get merchantInventory(): MerchantInventory {
    return this.shop.merchantInventory;
  }
  get hasRestockedToday(): boolean {
    return this.shop.hasRestockedToday;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Tracks whether we auto-paused the game because the tab went hidden.
   * Don't override an explicit user pause when the tab returns visible.
   * Phase 8b — closes a battery + UX bug where the loop kept ticking
   * during a tab switch and time-of-day silently advanced behind the user.
   */
  private autoPausedDueToHidden = false;
  private readonly onVisibilityChange = (): void => {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      // Only auto-pause if the user wasn't already paused.
      if (!this.gameLoop.isPaused) {
        this.gameLoop.setPaused(true);
        this.autoPausedDueToHidden = true;
      }
    } else if (this.autoPausedDueToHidden) {
      this.gameLoop.setPaused(false);
      this.autoPausedDueToHidden = false;
      this.bumpState();
    }
  };

  ngOnInit(): void {
    // Bump stateTick on orchestrator emissions so OnPush re-renders the parent.
    // Orchestrator state is exposed via getters, not signals — the tick signal
    // is the single source of truth that the template polls.
    this.orchestrator.stateChanged$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncMobileTabWithPhase();
      this.restartMessageToastAnimation();
      this.bumpState();
    });

    // Phase 8b — auto-pause on tab hidden, restore on visible.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    // Keep the viewport stationary while the game is mounted.
    this.scrollLock.lock();

    // Initialize orchestrator (loads game, starts event bus, starts loop, etc.)
    this.orchestrator.initialize();

    // Day 1 starts directly in playing mode; Day 2+ starts at merchant
    if (this.orchestrator.day !== 1) {
      this.gamePhaseService.transition('day-summary');
      this.gamePhaseService.transition('merchant');
    }

    if (this.orchestrator.day === 1 && this.orchestrator.tutorialStep === 0) {
      this.orchestrator.showMessage(
        'Adventurers will arrive seeking potions for the dungeon below. Click a potion to sell!',
        'info'
      );
    }
  }

  ngAfterViewInit(): void {
    // Start shell game after view is ready (Day 1 only, Day 2+ starts via openShop)
    if (this.gamePhase === 'playing') {
      this.mobileTabTimers.push(setTimeout(() => this.shellGame?.start(), TIMING.SPAWN_DELAY_MS));
    }
  }

  ngOnDestroy(): void {
    this.mobileTabTimers.forEach(clearTimeout);
    this.mobileTabTimers.length = 0;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    // Release the viewport lock when the game closes.
    this.scrollLock.unlock();
    this.orchestrator.cleanup();
    this.shellGame?.stop();
  }

  // ---------------------------------------------------------------------------
  // Template event handlers — thin delegates to orchestrator
  // ---------------------------------------------------------------------------

  togglePause(): void {
    if (this.dilutionBenchOpen() || this.closeDayConfirmationOpen()) return;
    this.gameLoop.togglePause();
    if (this.gameLoop.isPaused) {
      this.audio.suspend();
    } else {
      this.audio.resume();
    }
  }
  toggleAudio(): void {
    this.audio.toggleMute();
    this.bumpState();
  }
  changeSpeed(): void {
    this.gameLoop.cycleSpeed();
  }
  advanceTutorial(): void {
    this.orchestrator.advanceTutorial();
  }
  skipTutorial(): void {
    this.orchestrator.skipTutorial();
  }
  replayTutorial(): void {
    this.orchestrator.replayTutorial();
  }
  /** SSR/test-isolation guard: jsdom defaults to innerWidth=0 which is always <768. */
  private isMobileViewport(): boolean {
    return typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth < 768;
  }

  selectAdventurer(a: Adventurer): void {
    this.shop.selectCustomer(a);
    // Auto-advance to Potions tab on mobile after selecting a customer
    if (this.mobileActiveTab() === 'customers' && this.isMobileViewport()) {
      this.mobileTabTimers.push(setTimeout(() => this.setMobileTab('potions'), 300));
    }
  }
  onPotionSell(e: SellPotionEvent): void {
    // Capture reference before sell (selectedAdventurer may be cleared after sell)
    const adventurer = this.selectedAdventurer;
    this.orchestrator.sellPotion(e.potion, e.adventurer, e.priceMode);
    // Auto-return to Customers tab when customer's slots are full (mobile only)
    if (this.isMobileViewport() && this.mobileActiveTab() === 'potions') {
      if (adventurer && adventurer.potionsConsumed.length >= 2) {
        this.mobileTabTimers.push(setTimeout(() => this.setMobileTab('customers'), 400));
      }
    }
  }
  dilutePotion(p: Potion): void {
    this.orchestrator.dilutePotion(p);
  }
  onDilutionBenchOpenChange(open: boolean): void {
    if (open === this.dilutionBenchOpen()) return;

    this.dilutionBenchOpen.set(open);
    if (open) {
      this.resumeAfterDilutionBench = !this.gameLoop.isPaused;
      if (this.resumeAfterDilutionBench) {
        this.gameLoop.setPaused(true);
        this.audio.suspend();
      }
    } else {
      if (this.resumeAfterDilutionBench && this.gamePhase === 'playing' && !this.daySummaryData) {
        this.gameLoop.setPaused(false);
        this.audio.resume();
      }
      this.resumeAfterDilutionBench = false;
    }
    this.bumpState();
  }
  emergencyRestock(p: Potion): void {
    this.orchestrator.emergencyRestock(p);
  }
  buyFromMerchant(t: MerchantPotionType): void {
    this.orchestrator.buyFromMerchant(t);
  }
  buyAllFromMerchant(): void {
    this.orchestrator.buyAllFromMerchant();
  }
  buyUpgrade(t: PotionType): void {
    this.orchestrator.buyUpgrade(t);
  }
  openShop(): void {
    this.orchestrator.openShop(this.shellGame);
  }
  requestCloseDay(): void {
    if (
      this.gamePhase !== 'playing' ||
      this.tutorialStep > 0 ||
      this.dilutionBenchOpen() ||
      this.closeDayConfirmationOpen()
    )
      return;

    this.closeDayConfirmationOpen.set(true);
    this.resumeAfterCloseDayConfirmation = !this.gameLoop.isPaused;
    if (this.resumeAfterCloseDayConfirmation) {
      this.gameLoop.setPaused(true);
      this.audio.suspend();
    }
    this.bumpState();
  }
  cancelCloseDay(): void {
    if (!this.closeDayConfirmationOpen()) return;

    this.closeDayConfirmationOpen.set(false);
    if (this.resumeAfterCloseDayConfirmation && this.gamePhase === 'playing' && !this.daySummaryData) {
      this.gameLoop.setPaused(false);
      this.audio.resume();
    }
    this.resumeAfterCloseDayConfirmation = false;
    this.bumpState();
  }
  confirmCloseDay(): void {
    if (!this.closeDayConfirmationOpen()) return;

    this.closeDayConfirmationOpen.set(false);
    if (this.resumeAfterCloseDayConfirmation) {
      // Restore the same running-state contract as a natural day ending. The
      // phase guards suppress ticks during summary/merchant, and Open Shop can
      // then begin the next day without inheriting a modal-owned pause.
      this.gameLoop.setPaused(false);
      this.audio.resume();
    }
    this.resumeAfterCloseDayConfirmation = false;
    this.orchestrator.closeShopEarly();
    this.shellGame?.stop();
    this.bumpState();
  }
  dismissDaySummary(): void {
    this.orchestrator.dismissDaySummary();
  }
  onShellPotionWon(reward: ShellGameReward): void {
    this.orchestrator.onShellPotionWon(reward);
  }
  toggleLogNameDisplay(): void {
    this.orchestrator.toggleLogNameDisplay();
  }
  restartGame(): void {
    this.orchestrator.restartGame();
  }

  onExitToPortfolio(): void {
    window.location.assign('https://edconde.com/projects');
  }
  getRecommendedPotionId(): string | null {
    return this.orchestrator.getRecommendedPotionId(this.priceMode());
  }
  get potionForecasts(): ReadonlyMap<string, PotionForecast> {
    return this.orchestrator.getPotionForecasts(this.selectedAdventurer, this.priceMode());
  }
  setPriceMode(priceMode: PriceMode): void {
    this.priceMode.set(priceMode);
    this.orchestrator.setPriceMode(priceMode);
    this.bumpState();
  }
  getShellRewardType(): PotionType {
    return this.orchestrator.getShellRewardType();
  }
  getMerchantTotalCost(): number {
    return this.orchestrator.getMerchantTotalCost();
  }

  // Delegate to orchestrator where needed
  sellPotion(potion: Potion, adventurer: Adventurer): void {
    this.orchestrator.sellPotion(potion, adventurer, this.priceMode());
  }
  spawnAdventurer(): void {
    this.orchestrator.spawnAdventurer();
  }

  // ---------------------------------------------------------------------------
  // Display/formatting methods — stay in component (need DomSanitizer or are pure UI)
  // ---------------------------------------------------------------------------

  getReputationClass(): string {
    if (this.reputation < REPUTATION.NEUTRAL_THRESHOLD) return 'reputation-bad';
    if (this.reputation < REPUTATION.GOOD_THRESHOLD) return 'reputation-neutral';
    return 'reputation-good';
  }

  getGuiltClass(): string {
    if (this.guilt < GUILT.LOW_THRESHOLD) return 'guilt-low';
    if (this.guilt < GUILT.MEDIUM_THRESHOLD) return 'guilt-medium';
    if (this.guilt < GUILT.HIGH_THRESHOLD) return 'guilt-high';
    return 'guilt-maximum';
  }

  getTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }

  getAdventurerTitle(adventurerId: string): string {
    const shopAdventurer = this.shop.adventurersInShop.find((a) => a.id === adventurerId);
    if (shopAdventurer) {
      return `${shopAdventurer.name} the ${shopAdventurer.class}`;
    }

    const dungeonAdventurer = this.orchestrator.adventurersInDungeon.find((a) => a.id === adventurerId);
    if (dungeonAdventurer) {
      return `${dungeonAdventurer.name} the ${dungeonAdventurer.class}`;
    }

    return '';
  }

  formatLogMessage(message: string, showFull: boolean): string {
    const escaped = this.escapeHtml(message);

    const fullTitlePattern = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+the\s+[A-Z]\w+/;
    const titleMatch = escaped.match(fullTitlePattern);

    if (titleMatch) {
      if (showFull) {
        return escaped.replace(fullTitlePattern, '<strong class="clickable-name">$&</strong>');
      } else {
        const fullName = titleMatch[1];
        const firstName = fullName.split(' ')[0];
        return escaped.replace(fullTitlePattern, `<strong class="clickable-name">${firstName}</strong>`);
      }
    }

    const twoWordNamePattern = /^([A-Z][a-z]+)\s+([A-Z][a-z]+)/;
    const nameMatch = escaped.match(twoWordNamePattern);

    if (nameMatch) {
      const firstName = nameMatch[1];
      const fullName = `${nameMatch[1]} ${nameMatch[2]}`;

      if (showFull) {
        return escaped.replace(twoWordNamePattern, `<strong class="clickable-name">${fullName}</strong>`);
      } else {
        return escaped.replace(twoWordNamePattern, `<strong class="clickable-name">${firstName}</strong>`);
      }
    }

    const firstNamePattern = /^([A-Z][a-z]+)/;
    return escaped.replace(firstNamePattern, '<strong class="clickable-name">$1</strong>');
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  onLogMessageClick(event: MouseEvent): void {
    event.preventDefault();
    const target = event.target as HTMLElement;

    const strongElement = target.tagName === 'STRONG' ? target : target.closest('strong');

    if (strongElement && strongElement.classList.contains('clickable-name')) {
      this.orchestrator.toggleLogNameDisplay();
      event.stopPropagation();
    }
  }

  getCurrentTimeOfDay(): string {
    return this.orchestrator.timeOfDay;
  }

  getTimeBasedHint(): string {
    const hints: Record<string, string> = {
      Morning: 'Fresh adventurers arriving for the day',
      Afternoon: 'Peak hours - expect more customers',
      Evening: 'Last chance sales before nightfall',
      Night: 'Only desperate adventurers come at night',
    };
    return hints[this.orchestrator.timeOfDay];
  }

  getShortName(name: string): string {
    return name
      .replace(/\s*potion\s*of\s*/gi, '')
      .replace(/\s*potion$/gi, '')
      .replace(/^diluted\s*/gi, '')
      .replace(/^basic\s*/gi, '')
      .replace(/^strong\s*/gi, '')
      .replace(/^enhanced\s*/gi, '')
      .replace(/^greater\s*/gi, '')
      .trim();
  }

  getPotionTier(potion: Potion): string {
    const upgradeKey = this.getPotionUpgradeKey(potion.id);
    const tier = upgradeKey ? this.orchestrator.potionUpgrades[upgradeKey] || 0 : 0;
    return this.orchestrator.TIER_NAMES[tier];
  }

  getPotionUpgradeKey(potionId: string): string | null {
    const baseId = potionId.replace(/^diluted-/, '');

    const idToUpgradeKey: Record<string, string> = {
      'basic-healing': 'healing',
      'strength-potion': 'strength',
      'defense-potion': 'defense',
      'speed-elixir': 'speed',
      'luck-charm': 'luck',
    };
    return idToUpgradeKey[baseId] || null;
  }

  /** Get SVG icon for adventurer class (sanitized for innerHTML binding) */
  getClassIconSvg(adventurerClass: AdventurerClass): SafeHtml {
    const iconName = getClassIcon(adventurerClass);
    const svg = getIcon(iconName);
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  /** Get SVG icon for random event (sanitized for innerHTML binding) */
  getEventIconSvg(iconName: string): SafeHtml {
    const svg = getIcon(iconName as Parameters<typeof getIcon>[0]);
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  /** Maps a currentMessage severity to a Phosphor icon name for the visible toast. */
  private readonly messageSeverityIcons: Record<'info' | 'success' | 'warning' | 'error', string> = {
    info: 'info',
    success: 'check-circle',
    warning: 'warning',
    error: 'x-circle',
  };

  /** Get SVG icon for the visible message toast (sanitized for innerHTML binding) */
  getMessageIconSvg(type: 'info' | 'success' | 'warning' | 'error'): SafeHtml {
    return this.getEventIconSvg(this.messageSeverityIcons[type]);
  }

  /** Get SVG icon for summary modal stats (sanitized for innerHTML binding) */
  getSummaryIcon(type: 'profit' | 'gold' | 'saved' | 'deaths' | 'reputation'): SafeHtml {
    const iconMap: Record<string, 'coins' | 'heart' | 'skull' | 'trophy'> = {
      profit: 'coins',
      gold: 'coins',
      saved: 'heart',
      deaths: 'skull',
      reputation: 'trophy',
    };
    const svg = getIcon(iconMap[type]);
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  // Legacy method for compatibility
  restockInventory(): void {
    this.orchestrator.showMessage('Visit the merchant each morning to restock!', 'info');
  }

  // Delegate recommendation methods
  getRecommendedPotion(adventurer: Adventurer): Potion | null {
    return this.orchestrator.getRecommendedPotion(adventurer);
  }

  isRecommendationAvailable(potion: Potion): boolean {
    return this.orchestrator.isRecommendationAvailable(potion);
  }

  isRecommended(potion: Potion, adventurer: Adventurer): boolean {
    return this.orchestrator.isRecommended(potion, adventurer);
  }

  getPriceModifier(potion: Potion, adventurer: Adventurer): number {
    return this.orchestrator.getPriceModifier(potion, adventurer);
  }

  getEffectValue(baseEffect: number | undefined, quality: number): number {
    return this.orchestrator.getEffectValue(baseEffect, quality);
  }

  calculatePrice(potion: Potion, adventurer: Adventurer): number {
    return this.orchestrator.calculatePrice(potion, adventurer);
  }

  getUpgradedEffects(potion: Potion): PotionEffects {
    return this.orchestrator.getUpgradedEffects(potion);
  }

  canBuyUpgrade(upgradeType: PotionType): boolean {
    return this.orchestrator.canBuyUpgrade(upgradeType);
  }

  getNextUpgradeCost(upgradeType: PotionType): number | null {
    return this.orchestrator.getNextUpgradeCost(upgradeType);
  }

  getNextTierName(upgradeType: PotionType): string | null {
    return this.orchestrator.getNextTierName(upgradeType);
  }

  getCurrentTierName(upgradeType: PotionType): string {
    return this.orchestrator.getCurrentTierName(upgradeType);
  }

  isMaxTier(upgradeType: PotionType): boolean {
    return this.orchestrator.isMaxTier(upgradeType);
  }
}
