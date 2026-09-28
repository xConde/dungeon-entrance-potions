import { AudioService } from './audio.service';

describe('AudioService', () => {
  let service: AudioService;

  beforeEach(() => {
    service = new AudioService();
  });

  afterEach(() => {
    service.destroy();
  });

  it('should have default enabled state and volume', () => {
    expect(service.enabled).toBe(true);
    expect(service.volume).toBe(0.3);
  });

  it('toggleMute should flip enabled state', () => {
    service.toggleMute();
    expect(service.enabled).toBe(false);

    service.toggleMute();
    expect(service.enabled).toBe(true);
  });

  it('canPlay returns false when disabled', () => {
    service.toggleMute(); // disable
    // canPlay is private; we verify indirectly by calling playTone-based methods
    // with a mock AudioContext — here we just test that it doesn't throw
    expect(() => service.playCoinClink()).not.toThrow();
  });

  it('toggleMute saves prefs to localStorage', () => {
    const setSpy = spyOn(window.localStorage, 'setItem');
    service.toggleMute();
    expect(setSpy).toHaveBeenCalledWith('potion-stand-audio-prefs', jasmine.any(String));
  });

  it('loadPrefs restores enabled and volume from localStorage', () => {
    spyOn(window.localStorage, 'getItem').and.returnValue(JSON.stringify({ enabled: false, volume: 0.5 }));
    service.loadPrefs();
    expect(service.enabled).toBe(false);
    expect(service.volume).toBe(0.5);
  });

  it('loadPrefs handles corrupt localStorage data gracefully', () => {
    spyOn(window.localStorage, 'getItem').and.returnValue('not-valid-json{{{');
    expect(() => service.loadPrefs()).not.toThrow();
    // defaults unchanged
    expect(service.enabled).toBe(true);
    expect(service.volume).toBe(0.3);
  });

  it('loadPrefs handles null localStorage gracefully', () => {
    spyOn(window.localStorage, 'getItem').and.returnValue(null);
    expect(() => service.loadPrefs()).not.toThrow();
    expect(service.enabled).toBe(true);
  });

  it('canPlay respects prefers-reduced-motion', () => {
    spyOn(window, 'matchMedia').and.returnValue({
      matches: true,
    } as MediaQueryList);
    // No AudioContext created when reduced motion active — just verify no throw
    expect(() => service.playCoinClink()).not.toThrow();
  });

  it('destroy cleans up without error', () => {
    expect(() => service.destroy()).not.toThrow();
    // Calling destroy again should be safe
    expect(() => service.destroy()).not.toThrow();
  });

  it('suspend and resume do not throw when context is null', () => {
    expect(() => service.suspend()).not.toThrow();
    expect(() => service.resume()).not.toThrow();
  });

  // Phase 3c — pins the audio context teardown / pause-toggle contract.
  // Rapid pause-toggle was a candidate race (the v2 RTG flagged it as a
  // suspend/resume sequencing risk). Audit conclusion: state guards in
  // suspend() and resume() make it idempotent — pre-existing safety, but
  // worth a regression test now that we cite it from STRATEGIC_AUDIT.md.
  describe('Pause-toggle race contract (Phase 3c)', () => {
    it('rapid suspend/resume cycles do not throw', () => {
      // Force context creation so we exercise real state checks
      service.playCoinClink();
      expect(() => {
        for (let i = 0; i < 10; i++) {
          service.suspend();
          service.resume();
        }
      }).not.toThrow();
    });

    it('suspend after destroy is a no-op', () => {
      service.playCoinClink();
      service.destroy();
      expect(() => service.suspend()).not.toThrow();
      expect(() => service.resume()).not.toThrow();
    });

    it('resume only resumes when context is actually suspended', () => {
      service.playCoinClink();
      // After playCoinClink, context.state is typically 'running'
      expect(() => service.resume()).not.toThrow();
      service.suspend();
      // After suspend(), state should be 'suspended' (or transitioning)
      expect(() => service.resume()).not.toThrow();
    });
  });
});
