import * as THREE from "three";
import type { NebulaTheme } from "@/lib/nebula-theme";

export const LIGHTNING_SEGMENT_CAPACITY = 24 * 6 * 8;
const VERTICES_PER_SEGMENT = 6;

function noise(value: number) { const x = Math.sin(value * 91.17) * 43758.5453; return x - Math.floor(x); }

export class LightningSegments {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly centers: Float32Array;
  private readonly centerAttribute: THREE.BufferAttribute;
  private readonly intensity: Float32Array;
  private readonly intensityAttribute: THREE.BufferAttribute;
  private readonly cpuCenters: boolean;
  private readonly lite: boolean;

  constructor(theme: NebulaTheme, tier: "full" | "lite", webgl2: boolean, centers: Float32Array) {
    this.centers = centers; this.cpuCenters = !webgl2 || tier === "lite"; this.lite = tier === "lite";
    const vertices = LIGHTNING_SEGMENT_CAPACITY * VERTICES_PER_SEGMENT;
    const starts = new Float32Array(vertices * 3), ends = new Float32Array(vertices * 3), corners = new Float32Array(vertices * 2), indices = new Float32Array(vertices), expandedCenters = new Float32Array(vertices * 3);
    this.intensity = new Float32Array(vertices);
    const pattern = [0, -1, 0, 1, 1, -1, 1, -1, 0, 1, 1, 1];
    for (let orb = 0; orb < 24; orb += 1) for (let branch = 0; branch < 6; branch += 1) for (let segment = 0; segment < 8; segment += 1) {
      const slot = (orb * 48 + branch * 8 + segment), base = slot * VERTICES_PER_SEGMENT;
      const angle = branch * Math.PI / 3 + noise(orb * 73 + branch) * .65, startRadius = .82 + segment * .19, endRadius = startRadius + .22;
      const bend = (noise(slot * 3.1) - .5) * .24, y = (noise(slot * 7.7) - .5) * .32;
      for (let vertex = 0; vertex < VERTICES_PER_SEGMENT; vertex += 1) {
        const v = base + vertex, so = v * 3, co = v * 2;
        starts[so] = Math.cos(angle + bend) * startRadius; starts[so + 1] = y + segment * .025; starts[so + 2] = Math.sin(angle + bend) * startRadius * .35;
        ends[so] = Math.cos(angle - bend * .5) * endRadius; ends[so + 1] = y + (noise(slot + 9) - .4) * .18; ends[so + 2] = Math.sin(angle - bend * .5) * endRadius * .35;
        corners[co] = pattern[vertex * 2]; corners[co + 1] = pattern[vertex * 2 + 1]; indices[v] = orb;
      }
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
    this.geometry.setAttribute("aStart", new THREE.BufferAttribute(starts, 3)); this.geometry.setAttribute("aEnd", new THREE.BufferAttribute(ends, 3)); this.geometry.setAttribute("aCorner", new THREE.BufferAttribute(corners, 2)); this.geometry.setAttribute("aOrbIndex", new THREE.BufferAttribute(indices, 1));
    this.centerAttribute = new THREE.BufferAttribute(expandedCenters, 3); this.geometry.setAttribute("aCenter", this.centerAttribute);
    this.intensityAttribute = new THREE.BufferAttribute(this.intensity, 1); this.geometry.setAttribute("aIntensity", this.intensityAttribute);
    const uniformCenters = webgl2 && tier === "full";
    const centerLookup = uniformCenters ? "orbCenters[int(aOrbIndex)]" : "aCenter";
    this.material = new THREE.ShaderMaterial({ transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { orbCenters: { value: centers }, uResolution: { value: new THREE.Vector2(1, 1) }, uColor: { value: new THREE.Color(theme.palette.glow) }, uWidth: { value: tier === "full" ? 2.2 : 1.35 } },
      vertexShader: `attribute vec3 aStart; attribute vec3 aEnd; attribute vec2 aCorner; attribute float aOrbIndex; attribute vec3 aCenter; attribute float aIntensity; uniform vec3 orbCenters[24]; uniform vec2 uResolution; uniform float uWidth; varying float vIntensity; void main(){ vec3 center=${centerLookup}; vec4 a=projectionMatrix*modelViewMatrix*vec4(center+aStart,1.); vec4 b=projectionMatrix*modelViewMatrix*vec4(center+aEnd,1.); vec2 an=a.xy/a.w; vec2 bn=b.xy/b.w; vec2 direction=normalize((bn-an)*uResolution); vec2 normal=vec2(-direction.y,direction.x); gl_Position=mix(a,b,aCorner.x); gl_Position.xy+=normal*aCorner.y*uWidth/uResolution*gl_Position.w*2.; vIntensity=aIntensity; }`,
      fragmentShader: `uniform vec3 uColor; varying float vIntensity; void main(){ gl_FragColor=vec4(uColor*vIntensity,vIntensity); }` });
    this.mesh = new THREE.Mesh(this.geometry, this.material); this.mesh.frustumCulled = false; this.mesh.renderOrder = 3; this.mesh.raycast = () => null;
  }

  update(time: number, hovered: number, count: number, frame: number, width: number, height: number) {
    this.material.uniforms.uResolution.value.set(width, height);
    for (let orb = frame % 4; orb < 24; orb += 4) for (let segment = 0; segment < 48; segment += 1) {
      const branchSegment = segment % 8, active = !this.lite || branchSegment < (orb === hovered ? 5 : 1);
      const value = !active || orb >= count ? 0 : orb === hovered ? .72 + noise(time * 7 + segment) * .28 : branchSegment === 0 ? .13 + noise(time * 2 + orb) * .08 : 0;
      const base = (orb * 48 + segment) * VERTICES_PER_SEGMENT;
      for (let vertex = 0; vertex < VERTICES_PER_SEGMENT; vertex += 1) this.intensity[base + vertex] = value;
    }
    this.intensityAttribute.needsUpdate = true;
    if (this.cpuCenters) {
      const values = this.centerAttribute.array as Float32Array;
      for (let orb = 0; orb < 24; orb += 1) for (let vertex = 0; vertex < 48 * VERTICES_PER_SEGMENT; vertex += 1) {
        const target = (orb * 48 * VERTICES_PER_SEGMENT + vertex) * 3, source = orb * 3;
        values[target] = this.centers[source] ?? 0; values[target + 1] = this.centers[source + 1] ?? 0; values[target + 2] = this.centers[source + 2] ?? -1000;
      }
      this.centerAttribute.needsUpdate = true;
    }
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
