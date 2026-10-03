export type IslandAudioState = Readonly<{
  enabled: boolean;
  hidden: boolean;
  volume: number;
  progress: number;
  contextState: AudioContextState | "uninitialized";
  disposed: boolean;
  lastError: string | null;
  activeSources: number;
}>;

type Layers = {
  wind: GainNode;
  water: GainNode;
  chime: GainNode;
  strings: GainNode;
  waterFilter: BiquadFilterNode;
};

const PITCHES = [146.8324, 164.8138, 195.9977, 220, 246.9417, 293.6648];
const SAMPLE_RATE = 24000;
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const between = (low: number, high: number) => low + Math.random() * (high - low);

/** Original procedural sound, with no samples, network requests or automatic start. */
export class IslandAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private layers: Layers | null = null;
  private nodes = new Set<AudioNode>();
  private sources = new Map<AudioScheduledSourceNode, AudioNode[]>();
  private tones = new Map<string, AudioBuffer>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private starting: Promise<void> | null = null;
  private transitions: Promise<void> = Promise.resolve();
  private closing: Promise<void> | null = null;
  private enabled = false;
  private hidden = typeof document !== "undefined" && document.hidden;
  private volume = 0.35;
  private progress = 0;
  private disposed = false;
  private unlocked = false;
  private revision = 0;
  private lastError: string | null = null;
  private nextString = 0;
  private nextChime = 0;
  private nextWater = 0;
  private previousPitch = -1;

  get state(): IslandAudioState {
    return Object.freeze({
      enabled: this.enabled,
      hidden: this.hidden,
      volume: this.volume,
      progress: this.progress,
      contextState: this.context?.state ?? "uninitialized",
      disposed: this.disposed,
      lastError: this.lastError,
      activeSources: this.sources.size,
    });
  }

  /** Call directly in a click/pointer/keyboard handler, before any await. */
  async start(): Promise<void> {
    if (this.disposed) throw new Error("IslandAudio has been disposed.");
    if (this.starting) return this.starting;
    if (this.hidden) throw new Error("Cannot start audio while the page is hidden.");
    if (typeof navigator !== "undefined" && navigator.userActivation &&
        !navigator.userActivation.isActive) {
      throw new Error("Start audio from a user gesture.");
    }

    const revision = ++this.revision;
    this.enabled = true;
    this.lastError = null;
    // Both construction and resume happen synchronously in the gesture call stack.
    const operation = this.startContext(revision);
    this.starting = operation;
    try {
      await operation;
    } finally {
      if (this.starting === operation) this.starting = null;
    }
  }

  private async startContext(revision: number): Promise<void> {
    try {
      if (!this.context) {
        if (typeof window === "undefined") throw new Error("Web Audio requires a browser.");
        const AudioContextClass = window.AudioContext ??
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) throw new Error("Web Audio is not supported.");
        this.context = new AudioContextClass({ latencyHint: "playback" });
      }
      const context = this.context;
      await context.resume();
      if (this.disposed) throw new Error("IslandAudio was disposed during start.");
      if (context.state === "closed" || (!this.hidden && context.state !== "running")) {
        throw new Error("The audio context did not resume.");
      }
      if (!this.master) this.buildGraph(context);
      this.unlocked = true;
      this.applyScene();
      this.applyPlayback();
      this.queueVisibility();
    } catch (error) {
      this.recordError(error);
      if (this.revision === revision) this.enabled = false;
      this.applyPlayback();
      throw error;
    }
  }

  /** Does not create a context; first activation still requires start(). */
  setEnabled(enabled: boolean): void {
    if (this.disposed) return;
    ++this.revision;
    this.enabled = enabled;
    this.applyPlayback();
    this.queueVisibility();
  }

  setVolume(volume: number): void {
    if (this.disposed || !Number.isFinite(volume)) return;
    this.volume = clamp(volume);
    this.applyPlayback();
  }

  setProgress(progress: number): void {
    if (this.disposed || !Number.isFinite(progress)) return;
    const next = clamp(progress);
    if (next === this.progress) return;
    this.progress = next;
    this.applyScene();
  }

  /** Resolves after visibility handling, including recording any resume failure in state. */
  setHidden(hidden: boolean): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.hidden = hidden;
    this.applyPlayback();
    return this.queueVisibility();
  }

  private queueVisibility(): Promise<void> {
    if (!this.context || this.disposed) return this.transitions;
    // Serialize suspend/resume so a slow hide cannot undo a more recent show.
    this.transitions = this.transitions.then(async () => {
      const context = this.context;
      if (!context || this.disposed || context.state === "closed") return;
      if (this.hidden) {
        if (context.state !== "suspended") await context.suspend();
      } else if (this.enabled && this.unlocked && context.state !== "running") {
        await context.resume();
        if (!this.disposed && this.state.contextState !== "running") {
          throw new Error("The audio context did not resume after visibility change.");
        }
      }
      if (!this.disposed) this.applyPlayback();
    }).catch((error: unknown) => {
      if (this.disposed) return;
      this.recordError(error);
      this.enabled = false;
      this.applyPlayback();
    });
    return this.transitions;
  }

  private recordError(error: unknown): void {
    this.lastError = error instanceof Error ? error.message : String(error);
  }

  private keep<T extends AudioNode>(node: T): T {
    this.nodes.add(node);
    return node;
  }

  private smooth(param: AudioParam, value: number, seconds: number): void {
    const context = this.context;
    if (!context || context.state === "closed") return;
    const now = context.currentTime;
    if (typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(now);
    else {
      const current = param.value;
      param.cancelScheduledValues(now);
      param.setValueAtTime(current, now);
    }
    param.linearRampToValueAtTime(value, now + seconds);
  }

  private applyPlayback(): void {
    const context = this.context;
    if (!context || !this.master || this.disposed || context.state === "closed") {
      this.stopTimer();
      return;
    }
    const audible = this.enabled && !this.hidden && this.unlocked && context.state === "running";
    if (this.hidden) {
      // Suspension stops audio time: store exact zero before suspending, not an unfinished fade.
      this.master.gain.cancelScheduledValues(context.currentTime);
      this.master.gain.setValueAtTime(0, context.currentTime);
    } else this.smooth(this.master.gain, audible ? this.volume : 0, 0.65);
    if (!audible) this.stopTimer();
    else if (this.timer === null) {
      const now = context.currentTime;
      this.nextString = now + between(2.5, 4.5);
      this.nextChime = now + between(6, 10);
      this.nextWater = now;
      this.timer = setInterval(() => this.tick(), 500);
    }
  }

  private stopTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private buildGraph(context: AudioContext): void {
    const master = this.keep(context.createGain());
    master.gain.value = 0;
    const lowpass = this.keep(context.createBiquadFilter());
    lowpass.type = "lowpass";
    lowpass.frequency.value = 2600;
    lowpass.Q.value = 0.5;
    const compressor = this.keep(context.createDynamicsCompressor());
    compressor.threshold.value = -20;
    compressor.knee.value = 12;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.4;
    const limiter = this.keep(context.createWaveShaper());
    const curve = new Float32Array(4097);
    for (let i = 0; i < curve.length; i++) {
      curve[i] = 0.8 * Math.tanh(((i / (curve.length - 1)) * 2 - 1) / 0.8);
    }
    limiter.curve = curve;
    lowpass.connect(compressor).connect(limiter).connect(master).connect(context.destination);
    const bus = () => {
      const gain = this.keep(context.createGain());
      gain.gain.value = 0;
      gain.connect(lowpass);
      return gain;
    };
    const wind = bus();
    const water = bus();
    const chime = bus();
    const strings = bus();
    const windFilter = this.keep(context.createBiquadFilter());
    windFilter.type = "lowpass";
    windFilter.frequency.value = 460;
    windFilter.Q.value = 0.4;
    const waterFilter = this.keep(context.createBiquadFilter());
    waterFilter.type = "bandpass";
    waterFilter.frequency.value = 720;
    waterFilter.Q.value = 0.65;
    windFilter.connect(wind);
    waterFilter.connect(water);
    this.noise(context, 23, true, windFilter);
    this.noise(context, 31, false, waterFilter);
    this.layers = { wind, water, chime, strings, waterFilter };
    this.master = master;
  }

  private noise(context: AudioContext, seconds: number, soft: boolean, output: AudioNode): void {
    const buffer = context.createBuffer(1, SAMPLE_RATE * seconds, SAMPLE_RATE);
    const data = buffer.getChannelData(0);
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      const white = between(-1, 1);
      low = low * 0.97 + white * 0.03;
      const phase = (i / data.length) * Math.PI * 2;
      const swell = 0.65 + 0.18 * Math.sin(phase * 3) + 0.12 * Math.sin(phase * 7);
      data[i] = (soft ? low * 3 : white * 0.35 + low) * swell;
    }
    // Make the long procedural beds periodic without a discontinuity at the loop boundary.
    const seam = SAMPLE_RATE;
    const difference = data[data.length - 1] - data[0];
    for (let i = 0; i < seam; i++) {
      const t = i / (seam - 1);
      data[data.length - seam + i] -= difference * t * t * (3 - 2 * t);
    }
    const source = this.keep(context.createBufferSource());
    source.buffer = buffer;
    source.loop = true;
    source.connect(output);
    this.track(source, [source]);
    source.start();
  }

  private applyScene(): void {
    if (!this.layers) return;
    const p = this.progress;
    const pond = 1 - Math.abs(p * 2 - 1);
    const dusk = Math.max(0, p * 2 - 1);
    this.smooth(this.layers.wind.gain, 0.19 - p * 0.09, 2.4);
    this.smooth(this.layers.water.gain, 0.018 + pond * 0.16 + dusk * 0.025, 2.4);
    this.smooth(this.layers.chime.gain, 0.18 - dusk * 0.07, 2.4);
    this.smooth(this.layers.strings.gain, 0.24 + dusk * 0.13, 2.4);
  }

  private tick(): void {
    const context = this.context;
    if (!context || !this.layers || !this.enabled || this.hidden || this.disposed ||
        context.state !== "running") return;
    const now = context.currentTime;
    if (now >= this.nextWater) {
      this.smooth(this.layers.waterFilter.frequency, between(420, 1050), between(2.5, 4));
      this.nextWater = now + between(4, 7);
    }
    // Never catch up missed beats after a stalled tab: at most one event per layer per tick.
    if (now >= this.nextString) {
      let pitch = Math.floor(Math.random() * PITCHES.length);
      if (pitch === this.previousPitch) pitch = (pitch + 2) % PITCHES.length;
      this.previousPitch = pitch;
      this.playTone(PITCHES[pitch], false);
      this.nextString = now + between(5.5, 10.5) + (1 - this.progress) * 2;
    }
    if (now >= this.nextChime) {
      this.playTone([293.6648, 391.9954, 440][Math.floor(Math.random() * 3)], true);
      this.nextChime = now + between(12, 23);
    }
  }

  private toneBuffer(context: AudioContext, frequency: number, chime: boolean): AudioBuffer {
    const key = `${frequency}:${chime}`;
    const cached = this.tones.get(key);
    if (cached) return cached;
    const duration = chime ? 3.5 : 7;
    const buffer = context.createBuffer(1, SAMPLE_RATE * duration, SAMPLE_RATE);
    const data = buffer.getChannelData(0);
    const ratios = chime ? [1, 2.02, 3.91] : [1, 2, 3, 4, 5];
    for (let partial = 0; partial < ratios.length; partial++) {
      const ratio = ratios[partial];
      const strength = (chime ? 0.34 : 0.42) / Math.pow(partial + 1, 1.65);
      const decay = (chime ? 0.75 : 2.1) / (1 + partial * 0.55);
      for (let i = 0; i < data.length; i++) {
        const t = i / SAMPLE_RATE;
        const attack = Math.min(1, t / (chime ? 0.009 : 0.015));
        const tail = Math.min(1, (duration - t) / 0.2);
        data[i] += Math.sin(2 * Math.PI * frequency * ratio * t) *
          strength * attack * tail * Math.exp(-t / decay);
      }
    }
    this.tones.set(key, buffer);
    return buffer;
  }

  private playTone(frequency: number, chime: boolean): void {
    const context = this.context;
    if (!context || !this.layers || this.sources.size >= 8) return;
    const source = this.keep(context.createBufferSource());
    source.buffer = this.toneBuffer(context, frequency, chime);
    const gain = this.keep(context.createGain());
    gain.gain.value = between(0.55, 0.8);
    const pan = this.keep(context.createStereoPanner());
    pan.pan.value = between(-0.3, 0.3);
    source.connect(gain).connect(pan).connect(chime ? this.layers.chime : this.layers.strings);
    this.track(source, [source, gain, pan]);
    source.start(context.currentTime + 0.03);
  }

  private track(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    this.sources.set(source, nodes);
    source.onended = () => {
      source.onended = null;
      this.sources.delete(source);
      for (const node of nodes) {
        node.disconnect();
        this.nodes.delete(node);
      }
    };
  }

  /** Synchronously disconnects sound; its returned promise never rejects. */
  dispose(): Promise<void> {
    if (this.closing) return this.closing;
    this.disposed = true;
    this.enabled = false;
    ++this.revision;
    this.stopTimer();
    for (const source of this.sources.keys()) {
      source.onended = null;
      try { source.stop(); } catch { /* Already stopped or closed. */ }
      if ("buffer" in source) (source as AudioBufferSourceNode).buffer = null;
    }
    this.sources.clear();
    for (const node of this.nodes) node.disconnect();
    this.nodes.clear();
    this.tones.clear();
    this.master = null;
    this.layers = null;
    const context = this.context;
    try {
      this.closing = context && context.state !== "closed"
        ? context.close().catch((error: unknown) => this.recordError(error))
        : Promise.resolve();
    } catch (error) {
      this.recordError(error);
      this.closing = Promise.resolve();
    }
    return this.closing;
  }
}
