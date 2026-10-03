# Three-dimensional island verification

Verified locally on 2026-10-02. This supplements, rather than replaces, the earlier 2D verification notes.

## Implemented

- One Three.js landscape with a continuous four-stop path: field, pond, lamplight, grove.
- Route arc length is approximately 43.64 scene units versus 17.49 before extension (2.50x). These are scene units, not real-world metres.
- Camera follows the route and gently turns with its tangent. Scroll, vertical scene drag, route slider, arrows, keyboard and named destinations share one progress value.
- One 32-plank curved wooden bridge follows the path across the pond. The former disconnected jetty was removed.
- Cottage gables, roof fascia, doorway, window lattice and foundation are joined. A level terrain terrace keeps the whole building and eaves at one elevation.
- The front courtyard drops gently; two continuous rear hills rise to roughly 3-4 scene units. Road, tree roots, grass and camera reference the same height function.
- Extended grass coverage, 18 branching trees and 52 bamboo stems. Generated grass textures are locally bundled.
- GPU grass sway, water ripples, fine line movement, depth-aware ink edges, soft wash and paper grain. No dark screen vignette. Ink strength is adjustable.
- Original procedural sound layers, user-enabled only, with volume and position-dependent mixing. Not sampled reference recordings or AI-model-generated music.

## Automated checks

- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm test`: 42 passing tests covering journal data, audio lifecycle, wrapper save/export/search behavior, glyph transitions, route limits and terrain continuity / building terrace.
- `npm run build`: passed; static export generated.
- Node reports a non-fatal module-type inference warning during TypeScript stripping.

## Browser checks

Used the actual Codex in-app browser; the separate `localhost` origin held test journal data, while the user preview remains `127.0.0.1`.

- 1440x900 desktop, 390x844 phone, 320x568 small phone and 844x390 landscape viewport targets: no horizontal overflow and no header/footer controls outside the viewport. Browser scaling sometimes adds one CSS pixel.
- Scene canvas reports WebGL rendering, loaded grass assets and the ink-wash depth pass. Fresh test page console had no warnings/errors.
- Named place navigation and keyboard ArrowUp changed route progress; the camera heading changed along bends.
- Native drag on a visible wire triggered the revealing/rebound state without changing route progress (0.420).
- Sound switch successfully enabled and disabled; volume slider responded. No subjective listening-quality or real-device loudness claim is made.
- A clearly labeled grove test note saved successfully, survived reload and appeared under the grove location. It was moved to recoverable trash after testing; existing test notes were not removed.
- Mobile writing dialog, settings dialog and four-stop navigation inspected visually.
- Final responsive captures: `three-final-desktop.jpg`, `three-final-mobile.jpg`, `three-final-small.jpg`, `three-final-landscape.jpg`, and `three-final-mobile-write.jpg`.
- After a fresh reload of the debounce implementation, a 2px scene drag left route progress at 0.420. Pulling a wire entered its revealing state without moving the route; ArrowUp advanced progress from 42 to 50.
- Search uses a cancellable 200ms delay and pauses during Chinese IME composition. Tests execute the actual component callbacks for duplicate saves, failed-save retries and the shared 500ms export guard.
- Actual PNG and JSON files downloaded to the Windows Downloads folder. The PNG was opened and visually checked, including its separate caption band. The version-1 JSON backup was reimported without duplicates.
- The test note was edited, moved to trash, restored and deleted again. Reimporting the older backup preserved the newer text and tombstone: two active notes and two trash notes remained. Only the separate QA origin was changed.
- Handwritten characters form bird, flower and lantern silhouettes, with staggered entry and exit animation. Reduced motion settles the transition immediately. Selected older entries are included in the visible set without deleting other stored entries.

## Pixel evidence

900x500 scene-region RGB comparison from actual browser screenshots:

- Running frames: 426,208 / 1,350,000 channels differed by more than 3 levels.
- Paused frames: 0 / 1,350,000 channels differed; matching SHA-256 prefix `d03439737605f6a7`.
- Screenshot channel standard deviations around 30 establish a nonblank rendered frame; screenshots were also visually inspected.

Files are in `docs/previews/three-*.jpg`. Screenshots are real app output, distinct from the generated concept studies in `public/concepts`.

## Remaining limits

- Viewport emulation is not physical iOS/Android hardware testing. Mobile keyboard, battery use, thermal performance and touch ergonomics still need real-device testing.
- Audio synthesis tests and successful browser activation do not establish acoustic fidelity or subjective musical quality. Reference pages were read but reference recordings were not auditioned.
- No cloud synchronization, login or production deployment was added. Source delivery is to the user-authorized Git repository; the final response records the verified remote revision.
