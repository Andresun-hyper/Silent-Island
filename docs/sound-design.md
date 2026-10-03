# Island audio sidecar

## Provenance and boundaries

This is original procedural Web Audio synthesis, not AI-model-generated music,
not a real guqin performance, and not a recording of any acoustic instrument.
No music-generation model was available. No reference audio was downloaded,
copied, embedded, sampled, or auditioned for this implementation. The reference
page descriptions supplied with the task informed the arrangement only; this is
not a claim to have heard those recordings or reproduced their timbre.

Reference descriptions and license labels supplied with the task:

| Reference | Arrangement cue | Reported license |
| --- | --- | --- |
| [jppi_Stu: bamboo / wooden chimes](https://freesound.org/people/jppi_Stu/sounds/17091/) | Sparse woody resonances with space between events | CC BY 4.0 |
| [peridactyloptrix: quiet stream](https://beta.freesound.org/people/peridactyloptrix/sounds/197705/) | A quiet water bed, stronger near the pond | CC0 |
| [Pufermufin: bowed guzheng](https://beta.freesound.org/people/Pufermufin/sounds/396903/) | Restrained string resonance and long decays, not a bowed-instrument imitation | CC0 |
| [Pixabay: calm pond, wind in reeds](https://pixabay.com/sound-effects/film-special-effects-calm-pond-bright-wind-in-reeds-geese-water-ttp-190401-55746/) | Wind and water as separate depth layers; no goose sounds synthesized | License not independently verified here |

These links identify references, not bundled assets or a license grant for this
code. No third-party recording rights are being exercised. Any later use of an
actual recording needs its own license verification and required attribution;
the labels above must not substitute for that check.

## Sound palette

- Wind: 23-second original noise buffer, low-pass filtered at 460 Hz, with slow
  baked-in swells. It is an ambient bed, not a rhythmic music loop.
- Water: independent 31-second original noise buffer, broad band-pass filtering
  and slow randomized filter movement. This suggests subdued flowing water,
  not a realistic field recording. Both long buffers have smoothed loop seams.
- Bamboo-like chimes: three decaying, slightly inharmonic sine partials with a
  softened onset, once every 12-23 seconds. No sharp metallic high notes.
- Plucked strings: additive sine harmonics with progressively faster decay,
  softened attacks, and long tails. D/E/G/A/B pentatonic pitch classes, D3-D4
  range; irregular 5.5-12.5-second spacing, no drums, no fast repeating melody.
  This is a synthetic plucked-string impression, not authentic guqin/guzheng.

Progress continuously crossfades gains over 2.4 seconds: `0` emphasizes open
wind, `0.5` brings water forward, `1` reduces wind/chimes and warms the string
layer. No Three.js imports or scene ownership are required.

All layers feed a 2.6 kHz low-pass, compressor, bounded soft-saturating curve,
then a master gain defaulting to `0.35`. This limits digital peaks and retains
headroom, but does not guarantee hearing-safe loudness on arbitrary hardware.
Volume and enable changes ramp for 650 ms. Hiding sets exact zero immediately
before suspension, because a suspended audio clock cannot finish a fade.

## Integration API

Import the named `IslandAudio` class from `@/lib/island-audio`. Construct one
instance per mounted scene. Construction is silent and SSR-safe; do not share
a disposed instance across React Strict Mode effect re-mounts.

| API | Contract |
| --- | --- |
| `start(): Promise<void>` | Call directly from a user gesture before any `await`. Creates one context and calls `resume()` in that stack, enables playback, propagates genuine failures for UI feedback. Repeated/in-flight calls never add a graph or scheduler. |
| `setEnabled(boolean): void` | Fade to/from mute. Never creates a context or unlocks autoplay. Before the first successful `start()`, this only stores intent. |
| `setVolume(number): void` | Clamp finite values to 0-1. Ignore NaN and infinities. Default 0.35. |
| `setProgress(number): void` | Clamp finite values to 0-1 and crossfade the four scene layers. Ignore NaN and infinities. |
| `setHidden(boolean): void` | Forward `document.hidden`. Stop scheduling and suspend on hide; resume on show only if already enabled and successfully started. Never overrides a user's mute choice. |
| `state` | Read-only snapshot: `enabled`, `hidden`, `volume`, `progress`, `contextState`, `disposed`, `lastError`, `activeSources`. `enabled` is user intent, not a claim that the context is running. |
| `dispose(): Promise<void>` | Immediately stop sources, clear the timer, disconnect nodes and release buffers; close the context. Idempotent. Close failures are recorded, not unhandled rejections. Cannot restart a disposed instance. |

Browsers exposing `navigator.userActivation` are checked explicitly. Other
browsers rely on the caller's user-gesture contract and native autoplay policy.
Do not call `start()` in an effect, timeout, or after an asynchronous operation.

```ts
const audio = new IslandAudio();
const visibilityChanged = () => audio.setHidden(document.hidden);
document.addEventListener("visibilitychange", visibilityChanged);
visibilityChanged();

// Use directly inside the sound button's user-gesture handler.
async function enableSound() {
  try {
    await audio.start();
    // Update the UI using audio.state, not an optimistic playing label.
  } catch (error) {
    // Display the failure and let the user retry with another click.
    console.error(error);
  }
}

// Scene/controller callbacks:
audio.setProgress(0.5);
audio.setVolume(0.35);
// audio.setEnabled(false); // The mute action.

// In the owner's cleanup:
// document.removeEventListener("visibilitychange", visibilityChanged);
// void audio.dispose();
```

Visibility changes are serialized to avoid late suspend/resume races. A failed
background resume records `state.lastError` and clears `enabled`; the UI can
offer a fresh gesture-based `start()` retry. The module deliberately installs
no DOM listeners and touches no wrapper, package, or scene files.

## Verification

Run `node --experimental-strip-types --test tests/audio.test.mjs` for silent
mock-node lifecycle, synthesis, and scheduling tests. Run a standalone DOM type
check without writing incremental metadata:

```sh
npx tsc --noEmit --strict --target ES2017 --lib DOM,ESNext --module ESNext --moduleResolution Bundler --skipLibCheck src/lib/island-audio.ts
npx eslint src/lib/island-audio.ts tests/audio.test.mjs
```

No browser was operated and no audio was played during implementation. Mock
tests do not establish subjective timbre quality, real-device loudness, or
cross-browser autoplay behavior. Those remain listening/device QA for the
integrating owner, with the user's permission.

Implementation references: [MDN AudioContext.resume](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume),
[MDN AudioContext.close](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/close),
and [MDN AudioParam automation](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime).
