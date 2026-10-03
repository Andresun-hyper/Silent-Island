# Repository Notes

This is a standalone Next.js project for the ink-wash utility pole animation.

## Active Surface

- `src/app/page.tsx` renders the animation wrapper.
- `src/components/ink-poles-wrapper.tsx` provides the full-screen stage.
- `src/components/ink-island-three.tsx` owns the active Three.js render loop.
- `src/components/ink-poles-canvas.tsx` is the preserved legacy 2D renderer.
- `src/lib/animation/*` contains the drawing geometry, boiling, sway, grass, noise, and post-processing helpers.

## Commands

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
```

`npm run build` uses `output: "export"` and writes the static site to `out/`.

## Scope

Keep the project independent of Eazo, auth, notifications, database code, MCP routes, Tailwind, and shadcn UI unless those features are explicitly reintroduced.
