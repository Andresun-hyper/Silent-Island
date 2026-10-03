import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { IslandAudio } from "../src/lib/island-audio.ts";

class Param {
  value = 0;
  events = [];
  cancelAndHoldAtTime(time) { this.events.push(["hold", time]); }
  cancelScheduledValues(time) { this.events.push(["cancel", time]); }
  setValueAtTime(value, time) { this.value = value; this.events.push(["set", value, time]); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push(["ramp", value, time]); }
}

class Node {
  constructor(kind) {
    this.kind = kind;
    this.connections = [];
    this.disconnected = false;
    for (const key of ["gain", "frequency", "Q", "threshold", "knee", "ratio", "attack", "release", "pan"]) {
      this[key] = new Param();
    }
  }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; this.connections = []; }
  start(time = 0) { this.started = time; }
  stop() { this.stopped = true; this.onended?.(); }
  end() { this.ended = true; this.onended?.(); }
}

class Context {
  static instances = [];
  static resumeError = null;
  state = "suspended";
  currentTime = 0;
  nodes = [];
  buffers = [];
  resumeCalls = 0;
  suspendCalls = 0;
  closeCalls = 0;
  destination = new Node("destination");
  constructor() { Context.instances.push(this); }
  make(kind) { const node = new Node(kind); this.nodes.push(node); return node; }
  createGain() { return this.make("gain"); }
  createBiquadFilter() { return this.make("filter"); }
  createDynamicsCompressor() { return this.make("compressor"); }
  createWaveShaper() { return this.make("limiter"); }
  createBufferSource() { return this.make("source"); }
  createStereoPanner() { return this.make("pan"); }
  createBuffer(channels, length, sampleRate) {
    const data = new Float32Array(length);
    const buffer = { length, sampleRate, duration: length / sampleRate, getChannelData: () => data };
    this.buffers.push(buffer);
    return buffer;
  }
  async resume() {
    this.resumeCalls++;
    if (this.state === "closed") throw new Error("Already closed");
    if (Context.resumeError) throw Context.resumeError;
    if (this.resumeGate) await this.resumeGate;
    if (!this.staySuspended) this.state = "running";
  }
  async suspend() {
    this.suspendCalls++;
    if (this.suspendGate) await this.suspendGate;
    this.state = "suspended";
  }
  async close() {
    this.closeCalls++;
    if (this.closeError) throw this.closeError;
    this.state = "closed";
  }
  advance(seconds) {
    this.currentTime += seconds;
    for (const node of this.nodes) {
      if (node.kind === "source" && !node.loop && !node.ended && node.buffer &&
          this.currentTime >= node.started + node.buffer.duration) node.end();
    }
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

function setup(t, active = true) {
  const restore = (name, value) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  };
  restore("window", { AudioContext: Context });
  restore("navigator", { userActivation: { isActive: active } });
  restore("document", { hidden: false });
  Context.instances = [];
  Context.resumeError = null;
  const timers = new Map();
  let id = 0;
  t.mock.method(globalThis, "setInterval", (callback) => {
    timers.set(++id, callback);
    return id;
  });
  t.mock.method(globalThis, "clearInterval", (key) => timers.delete(key));
  const audio = new IslandAudio();
  t.after(() => audio.dispose());
  const tick = (seconds) => {
    Context.instances[0].advance(seconds);
    for (const callback of timers.values()) callback();
  };
  return { audio, timers, tick };
}

test("construction and setters are silent; finite values clamp and snapshots cannot mutate state", (t) => {
  const { audio } = setup(t);
  assert.equal(audio.state.volume, 0.35);
  audio.setEnabled(true);
  audio.setVolume(2);
  audio.setProgress(-3);
  audio.setVolume(NaN);
  audio.setProgress(Infinity);
  assert.equal(audio.state.volume, 1);
  assert.equal(audio.state.progress, 0);
  assert.equal(audio.state.contextState, "uninitialized");
  assert.equal(Context.instances.length, 0);
  assert.equal(Object.isFrozen(audio.state), true);
});

test("construction is SSR-safe and start outside a browser rejects honestly", async (t) => {
  const { audio } = setup(t);
  delete globalThis.window;
  await assert.rejects(audio.start(), /requires a browser/);
  assert.equal(audio.state.enabled, false);
  assert.match(audio.state.lastError, /requires a browser/);
});

test("start enforces available gesture signal without creating a context", async (t) => {
  const { audio } = setup(t, false);
  await assert.rejects(audio.start(), /user gesture/);
  assert.equal(Context.instances.length, 0);
});

test("create/resume is synchronous in the gesture, concurrent/repeated start does not stack", async (t) => {
  const { audio, timers } = setup(t);
  const first = audio.start();
  const context = Context.instances[0];
  assert.equal(context.resumeCalls, 1);
  await Promise.all([first, audio.start(), audio.start()]);
  const count = context.nodes.length;
  await audio.start();
  assert.equal(Context.instances.length, 1);
  assert.equal(context.nodes.length, count);
  assert.equal(audio.state.activeSources, 2);
  assert.equal(timers.size, 1);
  assert.equal(audio.state.contextState, "running");
});

test("resume rejection propagates original error; retry uses one context", async (t) => {
  const { audio, timers } = setup(t);
  const error = new Error("Autoplay denied");
  Context.resumeError = error;
  await assert.rejects(audio.start(), (received) => received === error);
  assert.equal(audio.state.enabled, false);
  assert.equal(audio.state.lastError, "Autoplay denied");
  assert.equal(audio.state.activeSources, 0);
  assert.equal(timers.size, 0);
  Context.resumeError = null;
  await audio.start();
  assert.equal(Context.instances.length, 1);
  assert.equal(audio.state.lastError, null);
  assert.equal(timers.size, 1);
});

test("a resolved resume that leaves a visible context suspended is not a success", async (t) => {
  const { audio } = setup(t);
  await audio.start();
  const context = Context.instances[0];
  context.state = "suspended";
  context.staySuspended = true;
  await assert.rejects(audio.start(), /did not resume/);
  assert.equal(audio.state.enabled, false);
});

test("mute and volume use gain ramps; progress changes layer balance", async (t) => {
  const { audio, timers } = setup(t);
  await audio.start();
  await flush();
  const context = Context.instances[0];
  const [master, wind, water, chime, strings] = context.nodes.filter((node) => node.kind === "gain");
  assert.equal(master.gain.value, 0.35);
  audio.setVolume(0.2);
  assert.deepEqual(master.gain.events.at(-1), ["ramp", 0.2, 0.65]);
  const openWater = water.gain.value;
  const openWind = wind.gain.value;
  const openStrings = strings.gain.value;
  audio.setProgress(0.5);
  assert.ok(water.gain.value > openWater);
  const pondWater = water.gain.value;
  audio.setProgress(1);
  assert.ok(water.gain.value < pondWater);
  assert.ok(wind.gain.value < openWind);
  assert.ok(strings.gain.value > openStrings);
  assert.ok(chime.gain.value < 0.18);
  audio.setEnabled(false);
  assert.deepEqual(master.gain.events.at(-1), ["ramp", 0, 0.65]);
  assert.equal(timers.size, 0);
  audio.setEnabled(true);
  assert.equal(master.gain.value, 0.2);
  assert.equal(timers.size, 1);
});

test("hidden suspends and enabled show resumes; muted show never resumes", async (t) => {
  const { audio, timers } = setup(t);
  await audio.start();
  await flush();
  const context = Context.instances[0];
  audio.setHidden(true);
  assert.equal(timers.size, 0);
  assert.equal(context.nodes[0].gain.value, 0);
  await flush();
  assert.equal(context.state, "suspended");
  assert.equal(audio.state.enabled, true);
  audio.setHidden(false);
  await flush();
  assert.equal(context.state, "running");
  assert.equal(timers.size, 1);
  audio.setHidden(true);
  await flush();
  audio.setEnabled(false);
  const resumes = context.resumeCalls;
  audio.setHidden(false);
  await flush();
  assert.equal(context.resumeCalls, resumes);
  assert.equal(context.state, "suspended");
  assert.equal(audio.state.enabled, false);
});

test("show never creates/unlocks audio, hidden start rejects", async (t) => {
  const { audio } = setup(t);
  audio.setEnabled(true);
  audio.setHidden(true);
  await assert.rejects(audio.start(), /hidden/);
  audio.setHidden(false);
  await flush();
  assert.equal(Context.instances.length, 0);
});

test("slow hide/show operations converge to latest intent without stacked schedulers", async (t) => {
  const { audio, timers } = setup(t);
  await audio.start();
  await flush();
  const context = Context.instances[0];
  const gate = deferred();
  context.suspendGate = gate.promise;
  audio.setHidden(true);
  await flush();
  audio.setHidden(false);
  gate.resolve();
  await flush();
  assert.equal(context.state, "running");
  assert.equal(timers.size, 1);
  assert.equal(context.resumeCalls, 2);
});

test("background resume failure is handled, visible in QA state and retryable", async (t) => {
  const { audio, timers } = setup(t);
  await audio.start();
  audio.setHidden(true);
  await flush();
  Context.resumeError = new Error("Device unavailable");
  audio.setHidden(false);
  await flush();
  assert.equal(audio.state.enabled, false);
  assert.equal(audio.state.lastError, "Device unavailable");
  assert.equal(timers.size, 0);
  Context.resumeError = null;
  await audio.start();
  assert.equal(audio.state.enabled, true);
});

test("user mute during an in-flight start is not undone by its completion", async (t) => {
  const { audio, timers } = setup(t);
  await audio.start();
  await flush();
  const context = Context.instances[0];
  const gate = deferred();
  context.resumeGate = gate.promise;
  const pending = audio.start();
  audio.setEnabled(false);
  gate.resolve();
  await pending;
  assert.equal(audio.state.enabled, false);
  assert.equal(timers.size, 0);
});

test("procedural buffers are finite, bounded, smooth at ends; finished voices disconnect", async (t) => {
  const { audio, tick } = setup(t);
  await audio.start();
  const context = Context.instances[0];
  tick(11);
  assert.equal(audio.state.activeSources, 4);
  for (const buffer of context.buffers) {
    const data = buffer.getChannelData(0);
    let peak = 0;
    for (const sample of data) {
      assert.ok(Number.isFinite(sample));
      peak = Math.max(peak, Math.abs(sample));
    }
    assert.ok(peak > 0.001 && peak < 1);
    assert.ok(Math.abs(data[0] - data.at(-1)) < 0.00001);
  }
  const limiter = context.nodes.find((node) => node.kind === "limiter");
  assert.ok([...limiter.curve].every((sample) => Math.abs(sample) < 0.8));
  audio.setEnabled(false);
  const voices = context.nodes.filter((node) => node.kind === "source" && !node.loop);
  context.advance(10);
  assert.equal(audio.state.activeSources, 2);
  assert.ok(voices.every((node) => node.disconnected));
});

test("long tab stalls schedule only one event per layer, never a catch-up burst", async (t) => {
  const { audio, tick } = setup(t);
  await audio.start();
  tick(3600);
  assert.equal(audio.state.activeSources, 4);
  const context = Context.instances[0];
  const count = context.nodes.length;
  tick(0.5);
  assert.equal(context.nodes.length, count);
});

test("dispose clears all nodes/sources/timers, closes once, and start cannot revive it", async (t) => {
  const { audio, timers, tick } = setup(t);
  await audio.start();
  tick(11);
  const context = Context.instances[0];
  await Promise.all([audio.dispose(), audio.dispose()]);
  assert.equal(context.closeCalls, 1);
  assert.equal(timers.size, 0);
  assert.equal(audio.state.activeSources, 0);
  assert.equal(audio.state.contextState, "closed");
  assert.ok(context.nodes.every((node) => node.disconnected));
  assert.ok(context.nodes.filter((node) => node.kind === "source").every((node) => node.stopped));
  audio.setEnabled(true);
  audio.setHidden(false);
  assert.equal(audio.state.enabled, false);
  await assert.rejects(audio.start(), /disposed/);
});

test("close rejection is consumed and recorded even when disposal is fire-and-forget", async (t) => {
  const { audio, timers } = setup(t);
  await audio.start();
  Context.instances[0].closeError = new Error("Close failed");
  void audio.dispose();
  await flush();
  assert.equal(audio.state.lastError, "Close failed");
  assert.equal(audio.state.disposed, true);
  assert.equal(timers.size, 0);
});

test("dispose during initial resume rejects start without building a late graph", async (t) => {
  const { audio, timers } = setup(t);
  const pending = audio.start();
  const rejected = assert.rejects(pending, /disposed/);
  await audio.dispose();
  await rejected;
  assert.equal(Context.instances[0].nodes.length, 0);
  assert.equal(timers.size, 0);
});

test("awaiting setHidden waits for delayed resume and exposes its final state", async (t) => {
  const { audio } = setup(t);
  await audio.start();
  await audio.setHidden(true);
  assert.equal(audio.state.contextState, "suspended");
  const gate = deferred();
  Context.instances[0].resumeGate = gate.promise;
  let completed = false;
  const pending = audio.setHidden(false).then(() => { completed = true; });
  await flush();
  assert.equal(completed, false);
  gate.resolve();
  await pending;
  assert.equal(audio.state.enabled, true);
  assert.equal(audio.state.contextState, "running");
});

test("awaiting setHidden observes handled failure, including before start and after dispose", async (t) => {
  const { audio } = setup(t);
  await audio.setHidden(false);
  await audio.start();
  await audio.setHidden(true);
  Context.resumeError = new Error("Resume denied");
  await audio.setHidden(false);
  assert.equal(audio.state.enabled, false);
  assert.equal(audio.state.lastError, "Resume denied");
  await audio.dispose();
  await audio.setHidden(false);
  assert.equal(audio.state.disposed, true);
});

// Execute the actual wrapper helpers/callbacks with inert hosts, without React rendering or a browser.
const wrapper = ts.createSourceFile("wrapper.tsx", readFileSync(new URL("../src/components/ink-poles-wrapper.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function wrapperCode(name) {
  let code;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) code = node.getText(wrapper);
    if (ts.isVariableDeclaration(node) && node.name.getText(wrapper) === name && node.initializer) {
      code = `const ${name} = ${node.initializer.getText(wrapper)};`;
    }
    ts.forEachChild(node, visit);
  }
  visit(wrapper);
  assert.ok(code, `Missing wrapper helper: ${name}`);
  return code;
}
function evaluate(code, globals = {}) {
  return runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, globals);
}
function wrapperCallback(name, globals) {
  return evaluate(`${wrapperCode(name)}\n${name};`, globals);
}

test("download attaches its anchor, removes it, and only revokes on failure", () => {
  const events = [];
  const anchor = { click() { assert.equal(this.attached, true); events.push("click"); }, remove() { this.attached = false; events.push("remove"); } };
  const download = wrapperCallback("download", {
    document: { createElement: () => anchor, body: { appendChild(node) { node.attached = true; events.push("append"); } } },
    URL: { createObjectURL: () => "blob:receipt", revokeObjectURL: () => events.push("revoke") },
  });
  assert.equal(download({}, "postcard.png"), "blob:receipt");
  assert.deepEqual(events, ["append", "click", "remove"]);
  events.length = 0;
  anchor.click = () => { throw new Error("Blocked download"); };
  assert.throws(() => download({}, "backup.json"), /Blocked download/);
  assert.deepEqual(events, ["append", "revoke", "remove"]);
});

test("postcard appends a DPI-scaled band, wraps two lines and never squeezes fonts", () => {
  for (const [width, height, clientWidth, dpr] of [[2880, 1800, 1440, 2], [960, 1800, 320, 3], [840, 1500, 280, 3], [640, 900, 0, 2]]) {
    const calls = [];
    const ctx = {
      font: "",
      drawImage: (...args) => calls.push(["image", ...args]),
      fillRect: (...args) => calls.push(["paper", ...args]),
      setTransform: (...args) => calls.push(["transform", ...args]),
      measureText(text) { return { width: [...text].length * parseFloat(this.font) }; },
      fillText(...args) { calls.push(["text", this.font, ...args]); },
    };
    const canvas = { getContext: () => ctx };
    const create = evaluate(`${wrapperCode("postcardLines")}\n${wrapperCode("createPostcard")}\ncreatePostcard;`, {
      document: { createElement: () => canvas }, window: { devicePixelRatio: dpr }, Intl,
    });
    const source = { width, height, clientWidth };
    const result = create(source, "Long caption with spacing ".repeat(15), "Island | 2026-10-02");
    const scale = clientWidth ? width / clientWidth : dpr;
    assert.equal(result.width, width);
    assert.equal(result.height, height + Math.ceil(122 * scale));
    assert.deepEqual(calls[0], ["image", source, 0, 0]);
    assert.deepEqual(calls[1], ["paper", 0, height, width, result.height - height]);
    assert.deepEqual(calls[2], ["transform", scale, 0, 0, scale, 0, height]);
    const text = calls.filter((call) => call[0] === "text");
    assert.equal(text.length, 3);
    assert.ok(text[1][2].endsWith("…"));
    for (const call of text) {
      assert.equal(call.length, 5, "fillText must have exactly three arguments");
      const textWidth = [...call[2]].length * parseFloat(call[1]);
      assert.ok(textWidth <= width / scale - 2 * Math.min(24, width / scale * .08));
      assert.ok(call[4] >= 20 && call[4] + parseFloat(call[1]) <= 122);
    }
  }
});

test("postcard null encoding reports an error; late callbacks after unmount or newer delivery do nothing", () => {
  let now = 0;
  let encode;
  const errors = [];
  const deliveries = [];
  const mountedRef = { current: true };
  const deliveryRequestRef = { current: 0 };
  const exportPostcard = wrapperCallback("exportPostcard", {
    lastExportRef: { current: -Infinity }, performance: { now: () => (now += 600) },
    mountedRef, deliveryRequestRef, canvasRef: { current: {} }, selected: null,
    currentPlace: { line: "Caption", label: "Pond" }, today: "2026-10-02",
    createPostcard: () => ({ toBlob(callback) { encode = callback; } }),
    setError: (error) => errors.push(error), deliver: (...args) => deliveries.push(args),
  });
  exportPostcard(); encode(null);
  assert.equal(errors.length, 1);
  exportPostcard(); mountedRef.current = false; encode({});
  assert.equal(deliveries.length, 0);
  mountedRef.current = true;
  exportPostcard(); deliveryRequestRef.current++; encode({});
  assert.equal(deliveries.length, 0);
  exportPostcard(); encode({});
  assert.equal(deliveries.length, 1);
});

test("postcard synchronous encoding failure reports an error instead of escaping", () => {
  const errors = [];
  const exportPostcard = wrapperCallback("exportPostcard", {
    lastExportRef: { current: -Infinity }, performance: { now: () => 1000 },
    deliveryRequestRef: { current: 0 }, canvasRef: { current: {} }, selected: null,
    currentPlace: { line: "Caption", label: "Pond" }, today: "2026-10-02",
    createPostcard: () => ({ toBlob() { throw new Error("Canvas cannot be encoded"); } }),
    setError: (error) => errors.push(error),
  });
  assert.doesNotThrow(exportPostcard);
  assert.equal(errors.length, 1);
});

test("postcard suppresses duplicate clicks for 500ms but allows the next deliberate export", () => {
  let now = 0, encodes = 0;
  const exportPostcard = wrapperCallback("exportPostcard", {
    lastExportRef: { current: -Infinity }, performance: { now: () => now },
    mountedRef: { current: true }, deliveryRequestRef: { current: 0 }, canvasRef: { current: {} }, selected: null,
    currentPlace: { line: "Caption", label: "Pond" }, today: "2026-10-02",
    createPostcard: () => ({ toBlob() { encodes++; } }), setError() {},
  });
  exportPostcard(); exportPostcard(); now = 499; exportPostcard();
  assert.equal(encodes, 1);
  now = 500; exportPostcard();
  assert.equal(encodes, 2);
});

test("a submitted journal entry cannot commit twice and a failed save remains retryable", () => {
  let commits = 0, success = true;
  const lock = { current: false };
  const save = wrapperCallback("saveEntry", {
    text: "Test note", ready: true, saveLockRef: lock, entries: [], editingId: null,
    crypto: { randomUUID: () => "test-id" }, mood: "quiet", form: "bird", place: "field",
    commit: () => { commits++; return success; }, localStorage: { removeItem() {} }, DRAFT_KEY: "draft",
    ROUTE_STOPS: { field: 0 }, setPlace() {}, setProgress() {}, setSelectedId() {}, setPanel() {},
    setText() {}, setEditingId() {}, setSceneKey() {}, setPhase() {}, setMessage() {},
  });
  const event = { preventDefault() {} };
  save(event); save(event);
  assert.equal(commits, 1);
  lock.current = false; success = false; save(event);
  assert.equal(lock.current, false);
  success = true; save(event);
  assert.equal(commits, 3);
});

test("search waits 200ms, cancels stale work, and does not filter during IME composition", () => {
  let source;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(wrapper) === "useEffect" && node.arguments[0]?.getText(wrapper).includes("setSettledSearch")) source = node.arguments[0].getText(wrapper);
    ts.forEachChild(node, visit);
  }
  visit(wrapper);
  assert.ok(source);
  const pending = new Map(), results = [];
  let id = 0;
  const globals = {
    window: { setTimeout(fn, delay) { assert.equal(delay, 200); pending.set(++id, fn); return id; } },
    clearTimeout: (key) => pending.delete(key), setSettledSearch: (value) => results.push(value),
  };
  const effect = (search, searchComposing) => evaluate(`const effect = ${source}; effect();`, { ...globals, search, searchComposing });
  const cancel = effect("first", false);
  assert.equal(results.length, 0);
  cancel(); effect("second", false);
  for (const callback of pending.values()) callback();
  assert.deepEqual(results, ["second"]);
  pending.clear(); effect("composing", true);
  assert.equal(pending.size, 0);
});

test("delivery replacement revokes only the old URL; toast timeout leaves the download intact", () => {
  const revoked = [];
  const deliveryUrlRef = { current: "blob:old" };
  let delivery;
  let message;
  const deliver = wrapperCallback("deliver", {
    download: () => "blob:new", deliveryUrlRef,
    URL: { revokeObjectURL: (url) => revoked.push(url) },
    setDelivery: (value) => { delivery = value; }, setMessage: (value) => { message = value; }, setError() {},
  });
  deliver({}, "postcard.png", "Generated");
  assert.deepEqual(revoked, ["blob:old"]);
  let toastEffect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(wrapper) === "useEffect" && node.arguments[0]?.getText(wrapper).includes("10000")) {
      toastEffect = node.arguments[0].getText(wrapper);
    }
    ts.forEachChild(node, visit);
  }
  visit(wrapper);
  assert.ok(toastEffect);
  let expire;
  evaluate(`const effect = ${toastEffect}; effect();`, {
    message, window: { setTimeout: (callback) => { expire = callback; } },
    setMessage: (value) => { message = value; },
    setDelivery: () => assert.fail("Toast must not clear delivery"),
  });
  expire();
  assert.equal(message, "");
  assert.equal(delivery.url, "blob:new");
  assert.equal(deliveryUrlRef.current, "blob:new");
});

function visibilityEffect() {
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(wrapper) === "useEffect" && node.arguments[0]?.getText(wrapper).includes('"visibilitychange"')) {
      effect = node.arguments[0].getText(wrapper);
    }
    ts.forEachChild(node, visit);
  }
  visit(wrapper);
  assert.ok(effect);
  return `const effect = ${effect}; effect;`;
}

test("wrapper visibility synchronizes settled enabled state and skips unmounted updates", async () => {
  const gate = deferred();
  const state = { enabled: true, lastError: null };
  const audio = { state, setHidden: () => gate.promise, dispose() {} };
  const updates = [];
  let visibility;
  const effect = evaluate(visibilityEffect(), {
    mountedRef: { current: false }, audioRef: { current: audio }, deliveryRequestRef: { current: 0 },
    deliveryUrlRef: { current: null }, tensionRafRef: { current: null },
    document: { hidden: false, addEventListener(type, handler) { visibility = handler; }, removeEventListener() {} },
    setSoundEnabled: (enabled) => updates.push(enabled), setError: (error) => updates.push(error),
  });
  const cleanup = effect();
  visibility();
  assert.equal(updates.length, 0);
  state.enabled = false; state.lastError = "Resume failed";
  gate.resolve();
  await flush();
  assert.equal(updates[0], false);
  assert.match(updates[1], /重试/);
  updates.length = 0;
  visibility(); cleanup();
  await flush();
  assert.equal(updates.length, 0);
});

test("wrapper audio start completing after unmount cannot update state", async () => {
  const gate = deferred();
  const audio = { state: { enabled: false }, start: () => gate.promise, setVolume() {}, setProgress() {} };
  const mountedRef = { current: true };
  const updates = [];
  const toggle = wrapperCallback("toggleSound", {
    soundBusy: false, audioRef: { current: audio }, mountedRef, volume: .35, progress: .5,
    setSoundBusy: (busy) => updates.push(busy),
    setSoundEnabled: () => assert.fail("Unmounted sound state update"),
    setError: () => assert.fail("Unmounted error update"),
  });
  const pending = toggle();
  assert.deepEqual(updates, [true]);
  mountedRef.current = false;
  gate.resolve();
  await pending;
  assert.deepEqual(updates, [true]);
});
