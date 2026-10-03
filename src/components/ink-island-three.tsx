"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createInkWorld, PAPER } from "@/lib/animation/island-three";
import { createInkRenderPass } from "@/lib/animation/ink-render-pass";
import { clampProgress, ROUTE_STOPS, ROUTE_VIEW_START, ROUTE_VIEW_SPAN } from "@/lib/island-route";
import type { Place } from "@/lib/journal";
import { terrainHeight } from "@/lib/island-terrain";
import { glyphPose, keepsakeGlyphs } from "@/lib/keepsake-glyphs";
import type { GlyphForm, KeepsakeGlyph } from "@/lib/keepsake-glyphs";
import type { InkPolesCanvasProps } from "./ink-poles-canvas";

interface IslandProps extends InkPolesCanvasProps {
  progress: number;
  inkStrength: number;
  onProgressChange: (progress: number) => void;
}

export default function InkIslandThree(props: IslandProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const current = useRef(props);
  const [failure, setFailure] = useState("");
  useEffect(() => { current.current = props; }, [props]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    } catch {
      requestAnimationFrame(() => setFailure("当前浏览器无法开启立体风景，手记仍可正常使用。"));
      return;
    }
    renderer.setClearColor(PAPER);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, .1, 160);
    const inkPass = createInkRenderPass(renderer, camera.near, camera.far);
    scene.add(new THREE.HemisphereLight("#f6f5ee", "#959b92", 2.2));
    const light = new THREE.DirectionalLight("#fbf8ef", 1.8);
    light.position.set(-8, 14, 9); scene.add(light);
    let disposed = false;
    const world = createInkWorld(scene,
      () => { if (!disposed) canvas.dataset.assets = "ready"; },
      () => { if (!disposed) setFailure("草木纹理未能载入，请刷新重试。手记不受影响。"); });
    canvas.dataset.renderer = "webgl";
    current.current.onCanvasReady?.(canvas);
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: .14 };
    const pointer = new THREE.Vector2();
    const hover = new THREE.Vector2();
    const hoverTarget = new THREE.Vector2();
    const dragPlane = new THREE.Plane();
    const dragPoint = new THREE.Vector3();
    const down = new THREE.Vector2();
    let activeWire: (typeof world.wires)[number] | null = null;
    let pressed = false, startProgress = 0, lastWheel = 0, dragStarted = false;
    let progress = current.current.progress, time = 0, previous = performance.now(), frame = 0;
    let width = 1, height = 1;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const target = new THREE.Vector3();
    let smoothedHeading: number | null = null;
    let entryKey = "";
    const notes = new THREE.Group(); scene.add(notes);
    type Note = { sprite: THREE.Sprite; context: CanvasRenderingContext2D; glyphs: KeepsakeGlyph[]; born: number; retiring: number | null; painted: number; x: number; y: number; index: number };
    const noteStates: Note[] = [];

    function removeNote(note: Note) {
      note.sprite.material.map?.dispose(); note.sprite.material.dispose(); notes.remove(note.sprite);
      noteStates.splice(noteStates.indexOf(note), 1);
    }

    function clearNotes() {
      [...noteStates].forEach(removeNote);
    }
    function makeNotes() {
      const entries = current.current.entries?.slice(0, 12) ?? [];
      const key = JSON.stringify(entries.map((e) => [e.id, e.text, e.form, e.place])) + current.current.sceneKey + current.current.place;
      if (entryKey === key) return;
      entryKey = key;
      for (const note of [...noteStates]) {
        if (note.retiring !== null) removeNote(note);
        else { note.retiring = time; note.painted = -1; note.sprite.userData.id = ""; }
      }
      const items = entries.length ? entries : [{ id: "", text: "风来时慢一点", form: "bird", place: current.current.place ?? "field" }];
      items.forEach((entry, index) => {
        const tile = document.createElement("canvas"); tile.width = tile.height = 256;
        const context = tile.getContext("2d")!;
        context.textAlign = "center"; context.textBaseline = "middle";
        context.fillStyle = "rgba(51,57,50,.92)";
        const texture = new THREE.CanvasTexture(tile); texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }));
        sprite.renderOrder = 2;
        const p = world.route.getPoint(ROUTE_VIEW_START + ROUTE_STOPS[entry.place as Place] * ROUTE_VIEW_SPAN);
        sprite.position.set(p.x + .65 + index % 3 * 1.1, p.y + (entry.form === "bird" ? 4.2 + index % 2 * .6 : 1.15), p.z - Math.floor(index / 3) * 1.15);
        sprite.scale.setScalar(entry.form === "bird" ? 2.6 : 1.35);
        sprite.userData = { id: entry.id };
        noteStates.push({ sprite, context, glyphs: keepsakeGlyphs(entry.text, entry.form as GlyphForm), born: time + index * .04, retiring: null, painted: -1, x: sprite.position.x, y: sprite.position.y, index });
        notes.add(sprite);
      });
    }

    function updateNotes(settled: boolean) {
      for (const note of [...noteStates]) {
        const leaving = note.retiring !== null;
        if (settled && !leaving) note.born = Math.min(note.born, time - 1.9);
        const age = time - (note.retiring ?? note.born);
        const progress = settled ? 1 : Math.max(0, Math.min(1, age / (leaving ? .85 : 1.9)));
        if (leaving && progress === 1) { removeNote(note); continue; }
        // Animate glyphs within one texture per note, then leave the GPU texture cached.
        const tick = Math.round(progress * 36);
        if (tick !== note.painted) {
          note.painted = tick;
          note.context.clearRect(0, 0, 256, 256);
          note.glyphs.forEach((glyph, i) => {
            const pose = glyphPose(glyph, i, tick / 36, leaving);
            note.context.save(); note.context.globalAlpha = pose.opacity;
            note.context.translate(pose.x, pose.y); note.context.rotate(pose.rotation);
            note.context.font = `${glyph.size}px "KaiTi", "STKaiti", serif`;
            note.context.fillText(glyph.character, 0, 0); note.context.restore();
          });
          note.sprite.material.map!.needsUpdate = true;
        }
        note.sprite.material.opacity = .9;
        note.sprite.position.y = note.y + Math.sin(time * .35 + note.index) * .09;
        note.sprite.position.x = note.x + (leaving ? progress * .35 : 0);
      }
      canvas!.dataset.keepsakes = String(noteStates.filter((note) => note.retiring === null).length);
      canvas!.dataset.retiringKeepsakes = String(noteStates.filter((note) => note.retiring !== null).length);
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = Math.max(1, rect.width); height = Math.max(1, rect.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, width < 600 ? 1.6 : 2));
      renderer.setSize(width, height, false);
      inkPass.resize(canvas!.width, canvas!.height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    function projectPointer(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      const unitsPerPixel = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.distanceTo(target) / height;
      raycaster.params.Line.threshold = unitsPerPixel * (width < 600 ? 14 : 10);
      raycaster.setFromCamera(pointer, camera);
    }
    function pointerDown(event: PointerEvent) {
      if (event.button !== 0 || !event.isPrimary) return;
      projectPointer(event);
      pressed = true; dragStarted = false; down.set(event.clientX, event.clientY); startProgress = current.current.progress;
      const hit = raycaster.intersectObjects(world.wires.map((w) => w.line))[0];
      if (hit) {
        activeWire = world.wires.find((w) => w.line === hit.object)!;
        activeWire.active = true;
        dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), hit.point);
      }
      canvas!.setPointerCapture(event.pointerId);
    }
    function pointerMove(event: PointerEvent) {
      projectPointer(event);
      if (!pressed && event.pointerType === "mouse" && !reduceMotion.matches) hoverTarget.copy(pointer).multiplyScalar(.2);
      if (!pressed) return;
      if (activeWire) {
        if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
          const middle = activeWire.from.clone().lerp(activeWire.to, .5);
          activeWire.pointer.copy(dragPoint).multiplyScalar(2).sub(middle);
          activeWire.tension = Math.min(1, activeWire.pointer.distanceTo(activeWire.rest) / 3);
          current.current.onWireTensionChange?.(activeWire.tension);
        }
      } else {
        if (!dragStarted && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 6) return;
        dragStarted = true;
        current.current.onProgressChange(clampProgress(startProgress + (down.y - event.clientY) / Math.max(400, height)));
      }
    }
    function pointerUp(event: PointerEvent) {
      if (!pressed) return;
      pressed = false;
      if (activeWire) {
        current.current.onWireRelease?.(activeWire.tension);
        current.current.onWireTensionChange?.(0);
        activeWire.active = false; activeWire = null;
      } else if (!dragStarted && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 7) {
        projectPointer(event);
        const hit = raycaster.intersectObjects(notes.children.filter((child) => child.userData.id))[0];
        if (hit?.object.userData.id) current.current.onKeepsakeSelect?.(hit.object.userData.id);
      }
      if (canvas!.hasPointerCapture(event.pointerId)) canvas!.releasePointerCapture(event.pointerId);
    }
    function cancel() {
      pressed = false; dragStarted = false;
      if (activeWire) activeWire.active = false;
      activeWire = null; current.current.onWireTensionChange?.(0);
    }
    function wheel(event: WheelEvent) {
      event.preventDefault();
      if (Math.abs(event.deltaY) < 1 || performance.now() - lastWheel < 30) return;
      lastWheel = performance.now();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
      current.current.onProgressChange(clampProgress(current.current.progress + Math.max(-.075, Math.min(.075, delta * .00045))));
    }
    function keyDown(event: KeyboardEvent) {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const p = event.key === "Home" ? 0 : event.key === "End" ? 1 : current.current.progress + (["ArrowUp", "ArrowRight"].includes(event.key) ? .08 : -.08);
      current.current.onProgressChange(clampProgress(p));
    }
    function contextLost(event: Event) { event.preventDefault(); setFailure("立体风景暂时中断，请刷新恢复。手记已保留。"); }
    canvas.addEventListener("pointerdown", pointerDown); canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp); canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("wheel", wheel, { passive: false }); canvas.addEventListener("keydown", keyDown);
    canvas.addEventListener("webglcontextlost", contextLost);

    function render(now: number) {
      if (disposed) return;
      const dt = Math.min(.05, (now - previous) / 1000); previous = now;
      const frozen = current.current.paused || document.hidden;
      if (!frozen && !reduceMotion.matches) time += dt;
      if (!document.hidden) {
        if (!frozen) hover.lerp(hoverTarget, 1 - Math.exp(-5 * dt));
        progress = reduceMotion.matches ? current.current.progress : THREE.MathUtils.damp(progress, current.current.progress, 3.2, dt);
        const routeT = ROUTE_VIEW_START + progress * ROUTE_VIEW_SPAN;
        const focal = world.route.getPoint(routeT);
        const tangent = world.route.getTangent(routeT);
        const portrait = width / height < .9;
        // Portrait follows the route lengthwise; desktop retains a wider lateral view.
        const distance = (portrait ? 1.36 : 1.16) - progress * .22;
        const xOffset = portrait ? 5.3 : 9;
        const elevation = terrainHeight(focal.x, focal.z);
        target.set(focal.x + (portrait ? .3 : 1), elevation + .65, focal.z - 2.3);
        const turn = Math.atan2(tangent.x, -tangent.z) * .24;
        const desiredHeading = Math.atan2(xOffset, 15.6) - turn;
        smoothedHeading = reduceMotion.matches || smoothedHeading === null ? desiredHeading : THREE.MathUtils.damp(smoothedHeading, desiredHeading, 5, dt);
        const heading = smoothedHeading;
        const radius = Math.hypot(xOffset, 15.6) * distance;
        camera.position.set(target.x + Math.sin(heading) * radius + (reduceMotion.matches ? 0 : hover.x), elevation + 10.7 * distance, target.z + Math.cos(heading) * radius + (reduceMotion.matches ? 0 : hover.y));
        camera.lookAt(target);
        world.update(time); makeNotes();
        updateNotes(reduceMotion.matches || frozen);
        const rendered = inkPass.render(scene, camera, time, current.current.inkStrength);
        canvas!.dataset.progress = progress.toFixed(3);
        canvas!.dataset.heading = heading.toFixed(3);
        canvas!.dataset.shader = "ink-wash-depth";
        canvas!.dataset.drawCalls = String(rendered.calls);
        canvas!.dataset.triangles = String(rendered.triangles);
      }
      frame = requestAnimationFrame(render);
    }
    frame = requestAnimationFrame(render);
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      canvas.removeEventListener("pointerdown", pointerDown); canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp); canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("wheel", wheel); canvas.removeEventListener("keydown", keyDown); canvas.removeEventListener("webglcontextlost", contextLost);
      clearNotes(); world.dispose(); inkPass.dispose(); renderer.dispose();
    };
  }, []);

  return <div className="world-viewport">
    <canvas ref={canvasRef} className="ink-canvas" tabIndex={0} role="img" aria-label="水墨孤岛。可沿小路漫步，也可拉动悬线。" />
    {failure && <p className="scene-error" role="alert">{failure}</p>}
  </div>;
}
