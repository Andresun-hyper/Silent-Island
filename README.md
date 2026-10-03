# Silent Island / 孤岛

A local-first handwritten journal inside a Three.js ink-wash landscape. Walk along one continuous path through meadow, pond, lamplit cottage and bamboo grove. Draggable wires, handwritten keepsakes, searchable notes, recoverable trash, JSON backup and PNG postcards remain available.

The visual effect is isolated from the Eazo platform shell. It only uses:

- `src/app/page.tsx`
- `src/components/ink-poles-wrapper.tsx`
- `src/components/ink-island-three.tsx`
- `src/lib/animation/*`
- `src/lib/journal.ts`
- `src/lib/island-route.ts` and `src/lib/island-terrain.ts`
- `src/lib/island-audio.ts`
- `src/lib/keepsake-glyphs.ts`

The previous 2D renderer remains in `src/components/ink-poles-canvas.tsx` as source history; it is not the active scene.

Notes stay in this browser's localStorage. There is no account, server database, cloud synchronization or clinical treatment claim. Export a backup before changing devices, domains or clearing browser data. See `docs/prd.md` for product and privacy boundaries.

## Getting Started

Install dependencies:

```bash
npm install
```

Start the local preview:

```bash
npm run dev -- --webpack --hostname 127.0.0.1
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Keep using the same hostname to retain access to the same local journal.

Build a static export:

```bash
npm run build
```

The generated site is written to `out/`.

## Verification

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Unit tests use Node.js 22's TypeScript stripping. The renderer batches static architecture and branches, instances generated grass artwork, and animates grass strokes on the GPU. A depth-aware shader adds broken ink edges, subtle wash and paper grain. The lowered courtyard, flat house terrace and rear hills share a continuous height function with the road, trees and camera.

Scroll, vertically drag the scene, use the route slider/arrows, or focus the canvas and press arrow keys to walk. Named stops move along the same path. The camera turns gently with the path. Motion can be paused; reduced-motion preferences are respected. Settings include ink intensity, sound, volume and export controls.

Audio starts only after an explicit sound-button gesture and is original procedural Web Audio synthesis, not AI-generated music or a sampled guqin recording. Reference sources and limitations are in `docs/sound-design.md`. No downloaded reference music is bundled.

Camera heading and pointer parallax are smoothed, with a 6px walking-drag threshold. Search waits 200ms after typing and respects IME composition. Save locks and a 500ms export guard prevent accidental duplicate actions without changing ambient grass or ink motion. See `docs/verification-three.md` for verification scope.
