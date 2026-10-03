import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ROUTE_POINTS, BRIDGE_ROUTE_START, BRIDGE_ROUTE_END } from "@/lib/island-route";
import { terrainHeight } from "@/lib/island-terrain";

export const PAPER = "#e3e4e0";
export const makeRoute = () => new THREE.CatmullRomCurve3(ROUTE_POINTS.map(([x, , z]) => new THREE.Vector3(x, terrainHeight(x, z), z)));

function random(seed = 7919) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

export function createInkWorld(scene: THREE.Scene, loaded: () => void, failed: () => void) {
  const rand = random();
  const root = new THREE.Group();
  scene.add(root);
  const time = { value: 0 };
  const route = makeRoute();
  const samples = route.getPoints(220);
  for (let i = 0; i <= 12; i++) samples.push(new THREE.Vector3(-.35, 0, -7.1).lerp(new THREE.Vector3(-1.65, 0, -7.7), i / 12));
  const textureLoader = new THREE.TextureLoader();
  const reedTexture = textureLoader.load("/ink-world/grass-ink.png", loaded, undefined, failed);
  reedTexture.colorSpace = THREE.SRGBColorSpace;
  reedTexture.anisotropy = 4;
  reedTexture.offset.y = .18;
  reedTexture.repeat.y = .66;

  const paper = document.createElement("canvas");
  paper.width = paper.height = 256;
  const pc = paper.getContext("2d")!;
  pc.fillStyle = "#e3e4e0"; pc.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 12000; i++) {
    pc.fillStyle = `rgba(50,48,43,${rand() * .05})`;
    pc.fillRect(rand() * 256, rand() * 256, .5 + rand(), .5 + rand());
  }
  const paperTexture = new THREE.CanvasTexture(paper);
  paperTexture.colorSpace = THREE.SRGBColorSpace;
  paperTexture.wrapS = paperTexture.wrapT = THREE.RepeatWrapping;
  paperTexture.repeat.set(7, 7);
  scene.background = paperTexture;

  const pigment = document.createElement("canvas");
  pigment.width = pigment.height = 256;
  const ctx = pigment.getContext("2d")!;
  ctx.fillStyle = "#d6d5ce"; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8000; i++) {
    ctx.fillStyle = `rgba(39,39,35,${rand() * .12})`;
    ctx.fillRect(rand() * 256, rand() * 256, rand() * 7, rand() * 2);
  }
  const pigmentTexture = new THREE.CanvasTexture(pigment);
  pigmentTexture.colorSpace = THREE.SRGBColorSpace;
  pigmentTexture.wrapS = pigmentTexture.wrapT = THREE.RepeatWrapping;
  const materials = {
    stone: new THREE.MeshStandardMaterial({ color: "#aaa99e", map: pigmentTexture, roughness: 1, flatShading: true }),
    wood: new THREE.MeshStandardMaterial({ color: "#757568", map: pigmentTexture, roughness: 1 }),
    roof: new THREE.MeshStandardMaterial({ color: "#6b706b", map: pigmentTexture, roughness: 1, side: THREE.DoubleSide }),
    wall: new THREE.MeshStandardMaterial({ color: "#eeede6", map: pigmentTexture, roughness: 1, side: THREE.DoubleSide }),
    dark: new THREE.MeshBasicMaterial({ color: "#454943" }),
    glow: new THREE.MeshBasicMaterial({ color: "#d9b77b" }),
  };
  type MaterialKey = keyof typeof materials;
  const batches: Partial<Record<MaterialKey, THREE.BufferGeometry[]>> = {};
  const ink: number[] = [];
  function stroke(points: THREE.Vector3[], close = false) {
    for (let i = 1; i < points.length; i++) ink.push(...points[i - 1].toArray(), ...points[i].toArray());
    if (close) ink.push(...points.at(-1)!.toArray(), ...points[0].toArray());
  }
  function geometry(g: THREE.BufferGeometry, material: MaterialKey, position: THREE.Vector3, rotation = 0, edges = true) {
    g.rotateY(rotation); g.translate(position.x, position.y, position.z);
    if (edges) {
      const edge = new THREE.EdgesGeometry(g, 28);
      ink.push(...edge.attributes.position.array);
      edge.dispose();
    }
    (batches[material] ??= []).push(g);
  }
  function box(x: number, y: number, z: number, w: number, h: number, d: number, material: MaterialKey = "wood", rotation = 0) {
    geometry(new THREE.BoxGeometry(w, h, d), material, new THREE.Vector3(x, y, z), rotation);
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: MaterialKey = "wood") {
    const direction = b.clone().sub(a);
    const g = new THREE.CylinderGeometry(radius * .5, radius, direction.length(), 5);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    geometry(g, material, a.clone().add(b).multiplyScalar(.5), 0, false);
    stroke([a, b]);
  }
  function pathDistance(x: number, z: number) {
    let distance = Infinity;
    for (const p of samples) distance = Math.min(distance, Math.hypot(x - p.x, z - p.z));
    return distance;
  }
  function inPond(x: number, z: number, padding = 0) {
    return ((x - 2.45) / (3.5 + padding)) ** 2 + ((z + 2.15) / (2.2 + padding)) ** 2 < 1;
  }

  // A translucent pigment field has no slab edge; the path remains reserved paper.
  const groundCanvas = document.createElement("canvas");
  groundCanvas.width = groundCanvas.height = 1024;
  const groundCtx = groundCanvas.getContext("2d")!;
  for (let i = 0; i < 5500; i++) {
    const z = rand() * 44 - 25;
    const x = (rand() - .5) * 28;
    const distance = pathDistance(x, z);
    if (distance < .68 || distance > 6.2 + rand() * 1.4 || inPond(x, z)) continue;
    const px = (x + 16) / 32 * 1024, py = (z + 27) / 48 * 1024;
    const radius = 12 + rand() * 37;
    const gradient = groundCtx.createRadialGradient(px, py, 0, px, py, radius);
    gradient.addColorStop(0, `rgba(104,104,89,${.015 + rand() * .07})`);
    gradient.addColorStop(1, "rgba(104,104,89,0)");
    groundCtx.fillStyle = gradient; groundCtx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
  }
  const groundTexture = new THREE.CanvasTexture(groundCanvas);
  groundTexture.colorSpace = THREE.SRGBColorSpace;
  function settle(g: THREE.BufferGeometry, base = 0) {
    const position = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) position.setY(i, position.getY(i) + terrainHeight(position.getX(i), position.getZ(i)) + base);
    if (g.attributes.normal) g.computeVertexNormals();
    position.needsUpdate = true;
    return g;
  }
  const terrainGeometry = new THREE.PlaneGeometry(32, 48, 128, 192);
  terrainGeometry.rotateX(-Math.PI / 2); terrainGeometry.translate(0, 0, -3); settle(terrainGeometry, -.035);
  const ground = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ map: groundTexture, transparent: true, depthWrite: false, roughness: 1, color: "#c5c7ba" }));
  root.add(ground);
  const hillMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vPoint;varying vec3 vNormal;void main(){vPoint=position;vNormal=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 vPoint;varying vec3 vNormal;
      float noise(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
      void main(){float h=smoothstep(.3,2.8,vPoint.y);float light=dot(normalize(vNormal),normalize(vec3(-.5,1.,.4)));
      vec3 ink=vec3(.57,.60,.57)+light*.12+noise(floor(vPoint.xz*65.))*.018;
      gl_FragColor=vec4(ink,h*.34);}`,
  });
  root.add(new THREE.Mesh(terrainGeometry.clone(), hillMaterial));

  const pathVertices: number[] = [], pathUVs: number[] = [];
  const pathSteps = 320;
  function pathEdge(t: number, side: number) {
    const p = route.getPoint(t), tangent = route.getTangent(t);
    p.add(new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(side * .69));
    p.y = terrainHeight(p.x, p.z) + .006;
    return p;
  }
  for (let i = 0; i < pathSteps; i++) {
    const t = i / pathSteps, next = (i + 1) / pathSteps;
    if (t > BRIDGE_ROUTE_START && t < BRIDGE_ROUTE_END) continue;
    const a = pathEdge(t, -1), b = pathEdge(t, 1), c = pathEdge(next, 1), d = pathEdge(next, -1);
    pathVertices.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray());
    pathUVs.push(0, t * 6, 1, t * 6, 1, next * 6, 0, t * 6, 1, next * 6, 0, next * 6);
  }
  const pathGeometry = new THREE.BufferGeometry();
  pathGeometry.setAttribute("position", new THREE.Float32BufferAttribute(pathVertices, 3));
  pathGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(pathUVs, 2)); pathGeometry.computeVertexNormals();
  root.add(new THREE.Mesh(pathGeometry, new THREE.MeshBasicMaterial({ color: "#e1e1d9", map: paperTexture, transparent: true, opacity: .38, side: THREE.DoubleSide })));

  // Dense painted tufts sit in 3D; vertex bending leaves the roots attached.
  const grassMaterial = new THREE.MeshBasicMaterial({ map: reedTexture, transparent: true, opacity: .24, alphaTest: .025, side: THREE.DoubleSide, depthWrite: false, color: "#a9aa9d" });
  grassMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = "uniform float uTime;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      float bend = pow(max(0.0, position.y), 1.7);
      transformed.x += sin(uTime * .63 + instanceMatrix[3].x * .8 + instanceMatrix[3].z * .6) * bend * .07;
      transformed.z += sin(uTime * .39 + instanceMatrix[3].z) * bend * .035;`);
  };
  const grassGeometry = new THREE.PlaneGeometry(2.1, 1, 2, 5);
  grassGeometry.translate(0, .5, 0);
  const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, 4000);
  const transform = new THREE.Object3D();
  let count = 0;
  for (let i = 0; i < 22000 && count < 4000; i++) {
    const z = rand() * 44 - 25;
    const x = (rand() - .5) * 28;
    const distance = pathDistance(x, z);
    if (distance < .85 || distance > 6 + rand() * 1.5 || inPond(x, z, .05) || (Math.abs(x + 2.1) < 1.8 && Math.abs(z + 8.7) < 1.5)) continue;
    const height = .22 + rand() ** 2 * .4;
    transform.position.set(x, terrainHeight(x, z) - .01, z);
    transform.rotation.set(0, .38 + (rand() - .5) * 1.1, 0);
    transform.scale.set(.15 + rand() * .23, height, 1);
    transform.updateMatrix(); grass.setMatrixAt(count, transform.matrix);
    grass.setColorAt(count, new THREE.Color().setHSL(.13 + rand() * .06, .06 + rand() * .08, .57 + rand() * .4));
    count++;
  }
  grass.count = count; root.add(grass);
  const blades: number[] = [], bladeHeights: number[] = [];
  for (let i = 0; i < 72000; i++) {
    const z = rand() * 44 - 25, x = (rand() - .5) * 28;
    const distance = pathDistance(x, z);
    if (distance < .82 || distance > 6.2 + rand() * 1.5 || inPond(x, z) || (Math.abs(x + 2.1) < 1.7 && Math.abs(z + 8.7) < 1.3)) continue;
    const height = .11 + rand() ** 2 * .48, bend = (rand() - .25) * .22;
    for (let j = 0; j < 4; j++) {
      for (const t of [j / 4, (j + 1) / 4]) {
        blades.push(x + t * t * bend, terrainHeight(x, z) + t * height, z + t * t * bend * .4);
        bladeHeights.push(t);
      }
    }
  }
  const bladeMaterial = new THREE.LineBasicMaterial({ color: "#696b5e", transparent: true, opacity: .37 });
  bladeMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = "uniform float uTime; attribute float aBladeHeight;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      transformed.x += sin(uTime*.63+position.z*.6+position.x*.8)*aBladeHeight*aBladeHeight*.055;`);
  };
  const bladeGeometry = new THREE.BufferGeometry();
  bladeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(blades, 3));
  bladeGeometry.setAttribute("aBladeHeight", new THREE.Float32BufferAttribute(bladeHeights, 1));
  root.add(new THREE.LineSegments(bladeGeometry, bladeMaterial));

  const waterMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: time },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv; uniform float uTime;
      float noise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){vec2 p=(vUv-.5)*2.;float d=length(p);float edge=1.-smoothstep(.76,1.,d+noise(floor(vUv*120.))*.035);
      float wave=sin(d*77.-uTime*1.1+sin(p.x*18.)*.6)*.017;
      vec3 color=vec3(.52,.58,.58)+wave+noise(floor(vUv*500.))*.035;
      gl_FragColor=vec4(color,edge*.25);}`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 4.6, 1, 1), waterMaterial);
  water.rotation.x = -Math.PI / 2; water.position.set(2.45, -.025, -2.15); root.add(water);
  const ripples: THREE.LineLoop[] = [];
  for (let k = 0; k < 5; k++) {
    const points = Array.from({ length: 90 }, (_, i) => new THREE.Vector3(Math.cos(i / 90 * Math.PI * 2) * (k * .27 + .24), 0, Math.sin(i / 90 * Math.PI * 2) * (k * .27 + .24)));
    const ripple = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: "#858e89", transparent: true, opacity: .16 }));
    ripple.position.set(3.9, .006 + k * .001, -2.15); root.add(ripple); ripples.push(ripple);
  }
  // One continuous crossing follows the path, with both landings outside the pond.
  const bridgeSides: THREE.Vector3[][] = [[], []];
  for (let i = 0; i <= 31; i++) {
    const u = i / 31, t = BRIDGE_ROUTE_START + u * (BRIDGE_ROUTE_END - BRIDGE_ROUTE_START);
    const p = route.getPoint(t), tangent = route.getTangent(t);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const y = .1 + Math.sin(u * Math.PI) * .27;
    const rotation = Math.atan2(-normal.z, normal.x);
    box(p.x, y, p.z, 1.2, .07, .148, "wood", rotation);
    for (const [index, side] of [-1, 1].entries()) {
      const rail = p.clone().addScaledVector(normal, side * .59); rail.y = y + .61;
      bridgeSides[index].push(rail);
      if (i % 5 === 0 || i === 31) {
        box(rail.x, y + .29, rail.z, .052, .7, .052, "wood", rotation);
        if (i > 0 && i < 31) box(rail.x, -.02, rail.z, .07, .43, .07, "wood", rotation);
      }
    }
  }
  bridgeSides.forEach((side) => {
    for (let i = 1; i < side.length; i++) {
      branch(side[i - 1], side[i], .023);
      branch(side[i - 1].clone().add(new THREE.Vector3(0, -.57, 0)), side[i].clone().add(new THREE.Vector3(0, -.57, 0)), .037);
    }
  });

  // The roof profile is curved at the eaves, with individually drawn tile courses.
  const cabin = new THREE.Vector3(-2.1, 0, -8.7);
  box(cabin.x, 1.03, cabin.z, 2.75, 2.06, 2, "wall");
  box(cabin.x, .12, cabin.z, 3.15, .24, 2.35, "stone");
  box(cabin.x + .45, .87, cabin.z + 1.018, .64, 1.4, .045, "wood");
  box(cabin.x - .68, 1.24, cabin.z + 1.025, .7, .73, .045, "dark");
  box(cabin.x - .68, 1.24, cabin.z + 1.052, .59, .62, .025, "glow");
  for (const dx of [-1.31, 1.31]) box(cabin.x + dx, 1.06, cabin.z + 1.055, .065, 1.97, .07, "wood");
  box(cabin.x, 1.98, cabin.z + 1.055, 2.72, .09, .07, "wood");
  for (const dx of [-1, -.68, -.36]) box(cabin.x + dx, 1.24, cabin.z + 1.073, .025, .64, .022, "wood");
  for (const y of [.94, 1.24, 1.54]) box(cabin.x - .68, y, cabin.z + 1.076, .66, .025, .022, "wood");
  for (const dx of [.11, .79]) box(cabin.x + dx, .89, cabin.z + 1.054, .045, 1.47, .055, "dark");
  box(cabin.x + .45, 1.62, cabin.z + 1.054, .75, .07, .055, "wood");
  box(cabin.x + .45, .85, cabin.z + 1.046, .012, 1.34, .018, "dark");
  for (const x of [.37, .53]) geometry(new THREE.SphereGeometry(.022, 8, 6), "dark", new THREE.Vector3(cabin.x + x, .83, cabin.z + 1.07), 0, false);
  const roofVertices: number[] = [], roofUv: number[] = [];
  function roofPoint(x: number, side: number, t: number) {
    return new THREE.Vector3(cabin.x + x, 2.51 - .75 * t + .23 * t ** 5, cabin.z + side * t * 1.43);
  }
  // Closed gables and a fascia remove the visible gap under the curved roof.
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-1.01, 2.01);
    shape.lineTo(0, 2.5); shape.lineTo(1.01, 2.01); shape.closePath();
    const gable = new THREE.ShapeGeometry(shape);
    gable.rotateY(Math.PI / 2);
    geometry(gable, "wall", new THREE.Vector3(cabin.x + side * 1.377, 0, cabin.z), 0, false);
    branch(new THREE.Vector3(cabin.x + side * 1.39, 2.02, cabin.z - 1.04), new THREE.Vector3(cabin.x + side * 1.39, 2.5, cabin.z), .035);
    branch(new THREE.Vector3(cabin.x + side * 1.39, 2.5, cabin.z), new THREE.Vector3(cabin.x + side * 1.39, 2.02, cabin.z + 1.04), .035);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const a = roofPoint(-1.7, side, i / 12), b = roofPoint(1.7, side, i / 12), c = roofPoint(1.7, side, (i + 1) / 12), d = roofPoint(-1.7, side, (i + 1) / 12);
      roofVertices.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray());
      roofUv.push(0, i / 12, 1, i / 12, 1, (i + 1) / 12, 0, i / 12, 1, (i + 1) / 12, 0, (i + 1) / 12);
      stroke([a, b]);
    }
    for (let k = 0; k < 27; k++) stroke(Array.from({ length: 13 }, (_, i) => roofPoint(-1.7 + k / 26 * 3.4, side, i / 12)));
  }
  const roof = new THREE.BufferGeometry();
  roof.setAttribute("position", new THREE.Float32BufferAttribute(roofVertices, 3)); roof.setAttribute("uv", new THREE.Float32BufferAttribute(roofUv, 2)); roof.computeVertexNormals();
  (batches.roof ??= []).push(roof);
  box(cabin.x, 2.53, cabin.z, 3.57, .08, .1, "roof");
  for (let i = 0; i < 3; i++) box(-1.6, .05 + i * .07, -7.2 - i * .16, 1.1, .1, .24, "stone");
  // Bench, lantern posts and a small letter box connect the journal to the landscape.
  for (let i = 0; i < 4; i++) box(2.45, .48, -5.3 + i * .1, 1.5, .06, .08);
  for (const x of [1.86, 3.04]) { box(x, .22, -5.15, .09, .5, .32); box(x, .69, -5.42, .06, .77, .06); }
  box(2.45, .92, -5.42, 1.5, .16, .045);
  box(-3.37, .55, 5.4, .08, 1.1, .09);
  box(-3.37, 1.08, 5.4, .5, .38, .3, "wood");
  box(-3.37, 1.16, 5.555, .3, .035, .015, "dark");
  for (const [x, z] of [[-.1, -6.8], [1.8, -4.9]]) {
    box(x, .9, z, .055, 1.8, .055);
    box(x + .14, 1.68, z, .35, .045, .045);
    geometry(new THREE.CylinderGeometry(.12, .14, .3, 8), "glow", new THREE.Vector3(x + .28, 1.48, z), 0, true);
    box(x + .28, 1.68, z, .32, .045, .25, "roof");
  }

  // Sparse branching trees use geometry, so camera travel reveals real parallax.
  function tree(x: number, z: number, height: number, willow = false) {
    const origin = new THREE.Vector3(x, 0, z);
    const crown = new THREE.Vector3(x - .2, height * .72, z + .15);
    branch(origin, crown, .08);
    for (let j = 0; j < 12; j++) {
      const angle = j * 2.4 + rand(), r = (.4 + rand()) * height * .4;
      const base = origin.clone().lerp(crown, .4 + rand() * .6);
      const end = new THREE.Vector3(x + Math.cos(angle) * r, height * (.63 + rand() * .37), z + Math.sin(angle) * r);
      branch(base, end, .025);
      for (let k = 0; k < 7; k++) {
        const tip = end.clone().add(new THREE.Vector3((rand() - .5) * .8, willow ? -.8 - rand() * 1.1 : rand() * .55, (rand() - .5) * .7));
        const curve = new THREE.QuadraticBezierCurve3(end, end.clone().add(new THREE.Vector3((tip.x - end.x) * .8, willow ? .05 : .3, (tip.z - end.z) * .8)), tip);
        stroke(curve.getPoints(8));
        for (let l = 1; l < 10; l++) {
          const p = curve.getPoint(l / 10), q = p.clone().add(new THREE.Vector3(.04 * (l % 2 ? 1 : -1), willow ? -.13 : .1, .025));
          stroke([p, q]);
        }
      }
    }
  }
  tree(4, -5.1, 3.6, true);
  tree(-4.5, -9.6, 3.7); tree(-.2, -10.5, 4.2); tree(-5.9, -6.8, 2.9); tree(2.7, -10.7, 3.3);
  for (const [x, z, height] of [
    [-9, 12, 3.2], [1, 11, 2.8], [-8, 9, 3.7], [2.6, 5.8, 3.4],
    [-7.4, -1.5, 3], [6.2, -6.5, 3.2], [-6.5, -13, 4.1],
    [4.2, -13.5, 3.5], [-5.4, -15.7, 3.2], [1, -17.1, 4.2],
    [-7.6, -19.5, 3.7], [.2, -22.1, 3.6], [-5.2, -23.5, 4],
  ]) tree(x, z, height);
  for (let i = 0; i < 52; i++) {
    const x = i < 24 ? -6.4 - rand() * 2.3 : -.4 + rand() * 2;
    const z = i < 24 ? -4.7 - rand() * 3.6 : -18.5 - rand() * 5;
    const height = 1.8 + rand() * 1.7, lean = (rand() - .5) * .6;
    for (let j = 0; j < 6; j++) {
      const a = new THREE.Vector3(x + lean * (j / 6) ** 2, height * j / 6, z);
      const b = new THREE.Vector3(x + lean * ((j + 1) / 6) ** 2, height * (j + 1) / 6, z);
      branch(a, b, .018);
      stroke([a.clone().add(new THREE.Vector3(-.026, 0, 0)), a.clone().add(new THREE.Vector3(.026, 0, 0))]);
      if (j < 2) continue;
      const side = j % 2 ? 1 : -1;
      const tip = a.clone().add(new THREE.Vector3(side * (.28 + rand() * .35), .21, .1));
      stroke([a, tip]);
      for (let k = 0; k < 6; k++) {
        const leaf = a.clone().lerp(tip, .35 + k * .11);
        const end = leaf.clone().add(new THREE.Vector3(side * .15, k % 2 ? .19 : -.22, .02));
        stroke([leaf, leaf.clone().lerp(end, .5).add(new THREE.Vector3(.035, 0, 0)), end], true);
      }
    }
  }

  for (let i = 0; i < 85; i++) {
    const z = rand() * 23 - 12, x = (rand() - .5) * 15;
    const distance = pathDistance(x, z);
    if (distance < 1 || distance > 4 || inPond(x, z)) continue;
    const s = .11 + rand() * .38;
    const g = new THREE.IcosahedronGeometry(s, 1);
    g.scale(1.4, .7, 1);
    geometry(g, "stone", new THREE.Vector3(x, s * .35, z), rand() * 4, false);
  }
  // Retain the original utility-pole motif and individually draggable hanging lines.
  const polePositions = [new THREE.Vector3(-4.1, 0, 7), new THREE.Vector3(-4.9, 0, 3.6), new THREE.Vector3(-3.5, 0, .3)];
  for (const p of polePositions) {
    box(p.x, 1.75, p.z, .065, 3.5, .07);
    box(p.x, 3.25, p.z, 1.25, .047, .06);
    for (const side of [-1, 1]) box(p.x + side * .5, 3.34, p.z, .05, .14, .045, "dark");
  }
  const wires: { line: THREE.Line; from: THREE.Vector3; to: THREE.Vector3; rest: THREE.Vector3; pointer: THREE.Vector3; tension: number; active: boolean }[] = [];
  for (let i = 0; i < 2; i++) for (const side of [-1, 1]) {
    const from = polePositions[i].clone().add(new THREE.Vector3(side * .5, 3.4, 0));
    const to = polePositions[i + 1].clone().add(new THREE.Vector3(side * .5, 3.4, 0));
    from.y += terrainHeight(from.x, from.z); to.y += terrainHeight(to.x, to.z);
    const rest = from.clone().lerp(to, .5).add(new THREE.Vector3(0, -.68, 0));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(from, rest, to).getPoints(50)), new THREE.LineBasicMaterial({ color: "#474942", transparent: true, opacity: .7 }));
    root.add(line); wires.push({ line, from, to, rest, pointer: rest.clone(), tension: 0, active: false });
  }
  for (const [key, geometries] of Object.entries(batches)) {
    // Custom roofs and polyhedra are non-indexed; normalize the primitive batches.
    const normalized = geometries.map((g) => g.index ? g.toNonIndexed() : g);
    const combined = mergeGeometries(normalized, false);
    if (combined) root.add(new THREE.Mesh(settle(combined), materials[key as MaterialKey]));
    new Set([...normalized, ...geometries]).forEach((g) => g.dispose());
  }
  const inkMaterial = new THREE.LineBasicMaterial({ color: "#434740", transparent: true, opacity: .42 });
  inkMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = "uniform float uTime;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      transformed.x += sin(position.y*17. + position.z*11. + floor(uTime*7.))*.002;
      transformed.z += sin(position.x*15. + uTime*.55)*max(0.,position.y-1.2)*.009;`);
  };
  const lines = new THREE.LineSegments(settle(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(ink, 3))), inkMaterial);
  root.add(lines);

  function update(seconds: number) {
    time.value = seconds;
    ripples.forEach((r, i) => {
      const cycle = (seconds * .075 + i / ripples.length) % 1;
      r.scale.setScalar(.5 + cycle * 1.25);
      (r.material as THREE.LineBasicMaterial).opacity = Math.sin(cycle * Math.PI) * .18;
    });
    for (const wire of wires) {
      if (!wire.active) { wire.pointer.lerp(wire.rest, .07); wire.tension *= .93; }
      const curve = new THREE.QuadraticBezierCurve3(wire.from, wire.pointer, wire.to);
      const position = wire.line.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i <= 50; i++) {
        const p = curve.getPoint(i / 50), weight = Math.sin(i / 50 * Math.PI);
        p.x += weight * (1 - wire.tension * .94) * (Math.sin(seconds * .8 + i * .09) * .034 + Math.sin(Math.floor(seconds * 7) + i * 2.4) * .004);
        position.setXYZ(i, p.x, p.y, p.z);
      }
      position.needsUpdate = true;
      wire.line.geometry.computeBoundingSphere();
    }
  }
  return {
    root, route, wires, update,
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
      root.traverse((object) => {
        const obj = object as THREE.Mesh;
        if (obj.geometry) geometries.add(obj.geometry);
        if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => mats.add(m));
      });
      geometries.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose());
      reedTexture.dispose(); paperTexture.dispose(); pigmentTexture.dispose(); groundTexture.dispose();
      Object.values(materials).forEach((m) => m.dispose());
      scene.remove(root); scene.background = null;
    },
  };
}
