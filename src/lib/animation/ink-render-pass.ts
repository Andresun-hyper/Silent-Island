import * as THREE from "three";

/** A light ink treatment, not a bloom/vignette filter. Depth finds real silhouettes. */
export function createInkRenderPass(renderer: THREE.WebGLRenderer, near: number, far: number) {
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const material = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: {
      tColor: { value: target.texture }, tDepth: { value: target.depthTexture },
      uPixel: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
      uNear: { value: near }, uFar: { value: far }, uStrength: { value: .65 },
      uPaper: { value: new THREE.Color("#e3e4e0") },
    },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `
      #include <packing>
      varying vec2 vUv;
      uniform sampler2D tColor;
      uniform sampler2D tDepth;
      uniform vec2 uPixel;
      uniform vec3 uPaper;
      uniform float uTime,uNear,uFar,uStrength;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float depthAt(vec2 uv){return -perspectiveDepthToViewZ(texture2D(tDepth,uv).x,uNear,uFar);}
      void main(){
        vec2 px=uPixel;
        vec3 center=texture2D(tColor,vUv).rgb;
        vec3 left=texture2D(tColor,vUv-vec2(px.x,0.)).rgb;
        vec3 right=texture2D(tColor,vUv+vec2(px.x,0.)).rgb;
        vec3 up=texture2D(tColor,vUv+vec2(0.,px.y)).rgb;
        vec3 down=texture2D(tColor,vUv-vec2(0.,px.y)).rgb;
        float depth=depthAt(vUv);
        float edge=max(abs(depth-depthAt(vUv+vec2(px.x,0.))),abs(depth-depthAt(vUv+vec2(0.,px.y))));
        edge=smoothstep(.12,.7,edge)*(1.-step(uFar*.98,depth));
        float pigment=hash(floor(gl_FragCoord.xy*.7));
        float broken=smoothstep(.16,.82,pigment);
        vec3 wash=(left+right+up+down)*.25;
        vec3 color=mix(center,wash,.13*uStrength);
        color=mix(color,color*.69,edge*broken*.34*uStrength);
        float grain=(hash(gl_FragCoord.xy+floor(uTime*5.)*.13)-.5)*.009*uStrength;
        color+=grain;
        float paperEdge=smoothstep(0.,.045,vUv.y)*smoothstep(0.,.055,1.-vUv.y);
        color=mix(uPaper,color,paperEdge);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const postScene = new THREE.Scene(); postScene.add(quad);
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return {
    resize(width: number, height: number) {
      target.setSize(width, height);
      material.uniforms.uPixel.value.set(1 / width, 1 / height);
    },
    render(scene: THREE.Scene, camera: THREE.Camera, time: number, strength: number) {
      material.uniforms.uTime.value = time;
      material.uniforms.uStrength.value = strength;
      renderer.setRenderTarget(target); renderer.render(scene, camera);
      const calls = renderer.info.render.calls, triangles = renderer.info.render.triangles;
      renderer.setRenderTarget(null); renderer.render(postScene, postCamera);
      return { calls: calls + 1, triangles: triangles + 2 };
    },
    dispose() { target.depthTexture?.dispose(); target.dispose(); quad.geometry.dispose(); material.dispose(); },
  };
}
