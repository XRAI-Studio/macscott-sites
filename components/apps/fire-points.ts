import * as THREE from "three";
import type { NebulaTheme } from "@/lib/nebula-theme";

export class FirePoints {
  readonly points: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly centers: Float32Array;
  private readonly orbIndices: Float32Array;
  private readonly centerAttribute: THREE.BufferAttribute;
  private readonly cpuCenters: boolean;

  constructor(theme: NebulaTheme, tier: "full" | "lite", webgl2: boolean, centers: Float32Array) {
    this.centers = centers; this.cpuCenters = !webgl2 || tier === "lite";
    const count = tier === "full" ? 1152 : 288;
    const position = new Float32Array(count * 3), seed = new Float32Array(count), birth = new Float32Array(count), radial = new Float32Array(count * 3), expandedCenters = new Float32Array(count * 3);
    this.orbIndices = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3, u = ((index * 53) % 100) / 100, z = 2 * (((index * 97) % 100) / 100) - 1, r = Math.sqrt(Math.max(0, 1 - z * z)), theta = 2 * Math.PI * u;
      this.orbIndices[index] = index % 24; seed[index] = (Math.sin(index * 91.17) * 43758.5453) % 1; birth[index] = (index * .6180339) % 1;
      radial[offset] = r * Math.cos(theta); radial[offset + 1] = z; radial[offset + 2] = r * Math.sin(theta);
    }
    this.geometry = new THREE.BufferGeometry(); this.geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    this.geometry.setAttribute("aOrbIndex", new THREE.BufferAttribute(this.orbIndices, 1)); this.geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1)); this.geometry.setAttribute("aBirth", new THREE.BufferAttribute(birth, 1)); this.geometry.setAttribute("aRadial", new THREE.BufferAttribute(radial, 3));
    this.centerAttribute = new THREE.BufferAttribute(expandedCenters, 3); this.geometry.setAttribute("aCenter", this.centerAttribute);
    const uniformCenters = webgl2 && tier === "full", centerLookup = uniformCenters ? "orbCenters[int(aOrbIndex)]" : "aCenter";
    this.material = new THREE.ShaderMaterial({ transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { orbCenters: { value: centers }, uTime: { value: 0 }, uHovered: { value: -1 }, uCore: { value: new THREE.Color(theme.palette.core) }, uMid: { value: new THREE.Color(theme.palette.mid) }, uGlow: { value: new THREE.Color(theme.palette.glow) } },
      vertexShader: `attribute float aOrbIndex; attribute float aSeed; attribute float aBirth; attribute vec3 aRadial; attribute vec3 aCenter; uniform vec3 orbCenters[24]; uniform float uTime; uniform float uHovered; varying float vAge; varying float vRich; void main(){ float age=fract(aBirth+uTime*(.09+aSeed*.05)); float rich=1.-step(.25,abs(aOrbIndex-uHovered)); float radius=.86+age*(.5+rich*.7); vec3 curl=vec3(sin(age*9.+aSeed*13.),sin(age*7.+aSeed*5.),cos(age*8.+aSeed*11.)); vec3 p=${centerLookup}+aRadial*radius+curl*0.14; vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=(2.6+rich*3.4)*(1.-age)*min(2.,8./max(1.,-mv.z)); vAge=age; vRich=rich; }`,
      fragmentShader: `uniform vec3 uCore; uniform vec3 uMid; uniform vec3 uGlow; varying float vAge; varying float vRich; void main(){ float d=length(gl_PointCoord-.5)*2.; float soft=smoothstep(1.,.05,d)*(1.-vAge); vec3 color=mix(uCore,uMid,vAge)+uGlow*vRich*.35; gl_FragColor=vec4(color*soft,soft*(.25+vRich*.65)); }` });
    this.points = new THREE.Points(this.geometry, this.material); this.points.frustumCulled = false; this.points.renderOrder = 2; this.points.raycast = () => null;
  }

  update(time: number, hovered: number, count: number) {
    this.material.uniforms.uTime.value = time; this.material.uniforms.uHovered.value = hovered;
    if (!this.cpuCenters) return;
    const values = this.centerAttribute.array as Float32Array;
    for (let index = 0; index < this.orbIndices.length; index += 1) {
      const orb = this.orbIndices[index], target = index * 3, source = orb * 3;
      values[target] = orb < count ? this.centers[source] : 0; values[target + 1] = orb < count ? this.centers[source + 1] : 0; values[target + 2] = orb < count ? this.centers[source + 2] : -1000;
    }
    this.centerAttribute.needsUpdate = true;
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
