import { Injectable } from '@angular/core';

/**
 * Web Audio API service for synthesized game sounds.
 * No audio files — all sounds are generated via oscillators.
 * Component-scoped: added to PotionStandComponent's providers[].
 */
@Injectable()
export class AudioService {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  enabled = true;
  volume = 0.3; // 0-1

  // Max simultaneous sounds
  private activeSounds = 0;
  private readonly MAX_SIMULTANEOUS = 3;

  private readonly PREFS_KEY = 'potion-stand-audio-prefs';

  /** Pending multi-tone sound-effect timeouts — cleared on destroy() so the
   *  service can be garbage collected without waiting for them to fire. */
  private readonly pendingToneTimeouts = new Set<ReturnType<typeof setTimeout>>();

  /** Schedule a delayed tone and track it so destroy() can cancel pending timers. */
  private scheduleTone(
    delay: number,
    frequency: number,
    duration: number,
    type: OscillatorType = 'sine',
    volumeMod: number = 1
  ): void {
    const id = setTimeout(() => {
      this.pendingToneTimeouts.delete(id);
      this.playTone(frequency, duration, type, volumeMod);
    }, delay);
    this.pendingToneTimeouts.add(id);
  }

  /** Create AudioContext on first user interaction (Chrome autoplay policy) */
  private ensureContext(): AudioContext | null {
    if (!this.context) {
      try {
        this.context = new AudioContext();
        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = this.volume;
        this.masterGain.connect(this.context.destination);
      } catch {
        return null;
      }
    }
    if (this.context.state === 'suspended') {
      void this.context.resume();
    }
    return this.context;
  }

  private respectsReducedMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  }

  private canPlay(): boolean {
    return this.enabled && !this.respectsReducedMotion() && this.activeSounds < this.MAX_SIMULTANEOUS;
  }

  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volumeMod: number = 1): void {
    if (!this.canPlay()) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    this.activeSounds++;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = this.volume * volumeMod;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => {
      this.activeSounds--;
    };
  }

  // --- Game Sound Effects ---

  /** Coin clink on sale */
  playCoinClink(): void {
    this.playTone(1200, 0.08, 'sine', 0.4);
    this.scheduleTone(50, 1500, 0.06, 'sine', 0.3);
  }

  /** Potion pour on restock */
  playPotionPour(): void {
    this.playTone(300, 0.3, 'sine', 0.2);
  }

  /** Door chime on customer arrival */
  playDoorChime(): void {
    this.playTone(800, 0.15, 'sine', 0.25);
    this.scheduleTone(100, 1000, 0.2, 'sine', 0.2);
  }

  /** Sword clash on combat */
  playSwordClash(): void {
    this.playTone(200, 0.1, 'sawtooth', 0.3);
    this.playTone(150, 0.08, 'square', 0.2);
  }

  /** Death knell */
  playDeathKnell(): void {
    this.playTone(150, 0.5, 'sine', 0.4);
    this.scheduleTone(200, 100, 0.6, 'sine', 0.3);
  }

  /** Triumphant horn on victory */
  playVictoryHorn(): void {
    this.playTone(440, 0.15, 'square', 0.25);
    this.scheduleTone(150, 554, 0.15, 'square', 0.25);
    this.scheduleTone(300, 659, 0.3, 'square', 0.3);
  }

  /** Button click */
  playClick(): void {
    this.playTone(600, 0.04, 'sine', 0.15);
  }

  /** Combo activation */
  playCombo(): void {
    this.playTone(600, 0.1, 'sine', 0.3);
    this.scheduleTone(80, 800, 0.1, 'sine', 0.3);
    this.scheduleTone(160, 1000, 0.15, 'sine', 0.35);
  }

  /** Phase transition */
  playPhaseChange(): void {
    this.playTone(400, 0.2, 'triangle', 0.2);
    this.scheduleTone(150, 500, 0.2, 'triangle', 0.2);
  }

  /** Toggle mute */
  toggleMute(): void {
    this.enabled = !this.enabled;
    if (this.masterGain) {
      this.masterGain.gain.value = this.enabled ? this.volume : 0;
    }
    this.savePrefs();
  }

  /** Suspend context when paused (battery savings) */
  suspend(): void {
    if (this.context?.state === 'running') {
      void this.context.suspend();
    }
  }

  /** Resume context */
  resume(): void {
    if (this.context?.state === 'suspended' && this.enabled) {
      void this.context.resume();
    }
  }

  /** Load audio preferences from localStorage */
  loadPrefs(): void {
    try {
      const prefs = window.localStorage.getItem(this.PREFS_KEY);
      if (prefs) {
        const parsed = JSON.parse(prefs) as { enabled?: boolean; volume?: number };
        this.enabled = parsed.enabled ?? true;
        this.volume = parsed.volume ?? 0.3;
      }
    } catch {
      /* ignore corrupt prefs */
    }
  }

  /** Save audio preferences to localStorage */
  private savePrefs(): void {
    try {
      window.localStorage.setItem(
        this.PREFS_KEY,
        JSON.stringify({
          enabled: this.enabled,
          volume: this.volume,
        })
      );
    } catch {
      /* ignore quota errors */
    }
  }

  /** Clean up */
  destroy(): void {
    this.pendingToneTimeouts.forEach((id) => clearTimeout(id));
    this.pendingToneTimeouts.clear();
    void this.context?.close();
    this.context = null;
    this.masterGain = null;
  }
}
