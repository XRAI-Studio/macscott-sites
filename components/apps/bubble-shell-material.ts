import * as THREE from "three";
import type { NebulaTheme } from "@/lib/nebula-theme";

// Animated procedural shell: Scott's orbs are flowing fireballs (turbulent
// domain-warped fbm over the whole surface, like a sun); Alexander's carry
// electric filaments crawling across the surface. `uTime` is advanced every
// frame by the sim loop; `aSeed` gives each orb its own pattern/phase and keeps
// the fire anchored to the (object-space) surface as the orb wanders.
export class BubbleShellResources {
  readonly geometry: THREE.SphereGeometry;
  readonly material: THREE.ShaderMaterial;
  readonly state: THREE.InstancedBufferAttribute;

  constructor(theme: NebulaTheme, count: number, tier: "full" | "lite", webgl2: boolean) {
    this.geometry = new THREE.SphereGeometry(.86, tier === "full" ? 40 : 18, tier === "full" ? 28 : 12);
    this.state = new THREE.InstancedBufferAttribute(new Float32Array(count), 1); this.geometry.setAttribute("aState", this.state);
    const seeds = new Float32Array(count); for (let index = 0; index < count; index += 1) seeds[index] = Math.abs((Math.sin(index * 127.1) * 43758.5453) % 1);
    this.geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    const dither = !webgl2 || tier === "lite", octaves = tier === "full" ? 4 : 2, warp = tier === "full", scale = 3.1;
    this.material = new THREE.ShaderMaterial({ transparent: !dither, depthTest: true, depthWrite: true, side: THREE.DoubleSide,
      uniforms: { uTint: { value: new THREE.Color(theme.shellTint) }, uCore: { value: new THREE.Color(theme.palette.core) }, uMid: { value: new THREE.Color(theme.palette.mid) }, uGlow: { value: new THREE.Color(theme.palette.glow) }, uTime: { value: 0 }, uEffect: { value: theme.effect === "lightning" ? 1 : 0 } },
      vertexShader: `attribute float aState; attribute float aSeed; varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal; varying float vState; varying float vSeed; void main(){ vec4 local=vec4(position,1.); vec3 nl=normal;
#ifdef USE_INSTANCING
local=instanceMatrix*local; nl=mat3(instanceMatrix)*nl;
#endif
vec4 view=modelViewMatrix*local; vNormal=normalize(normalMatrix*nl); vView=normalize(-view.xyz); vLocal=position; vState=aState; vSeed=aSeed; gl_Position=projectionMatrix*view; }`,
      fragmentShader: `precision highp float; uniform vec3 uTint; uniform vec3 uCore; uniform vec3 uMid; uniform vec3 uGlow; uniform float uTime; uniform float uEffect; varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal; varying float vState; varying float vSeed;
float hash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f); return mix(mix(mix(hash(i+vec3(0.,0.,0.)),hash(i+vec3(1.,0.,0.)),f.x),mix(hash(i+vec3(0.,1.,0.)),hash(i+vec3(1.,1.,0.)),f.x),f.y),mix(mix(hash(i+vec3(0.,0.,1.)),hash(i+vec3(1.,0.,1.)),f.x),mix(hash(i+vec3(0.,1.,1.)),hash(i+vec3(1.,1.,1.)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=0.5; float s=0.0; for(int i=0;i<${octaves};i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
${dither ? "float bayer(vec2 p){ vec2 q=mod(floor(p),4.); float x=q.x,y=q.y; return (mod(x,2.)*8.+mod(y,2.)*4.+mod(floor(x/2.),2.)*2.+mod(floor(y/2.),2.)+.5)/16.; }" : ""}
void main(){ vec3 n=normalize(vNormal); float fres=pow(1.0-abs(dot(n,normalize(vView))),1.7); vec3 dom=vLocal*${scale.toFixed(1)}+vec3(vSeed*41.0); float t=uTime; vec3 color; float alpha;
if(uEffect<0.5){ ${warp ? "vec3 w=vec3(fbm(dom+t*0.5),fbm(dom+7.3-t*0.4),fbm(dom*1.2+t*0.3)); float fire=fbm(dom+w*1.7+vec3(0.0,-t*1.1,0.0));" : "float fire=fbm(dom+vec3(0.0,-t*1.1,0.0));"}
fire=pow(clamp(fire*1.45,0.0,1.0),1.4); float hot=smoothstep(0.55,0.95,fire); float dark=smoothstep(0.30,0.66,fbm(dom*0.85+vec3(t*0.22,-t*0.28,t*0.18))); color=mix(uMid*0.22,uCore,fire); color=mix(color,uGlow,hot); color+=vec3(1.0,0.92,0.7)*pow(hot,3.0)*0.9; color*=mix(0.28,1.0,max(hot,dark)); color+=uGlow*fres*0.45; alpha=clamp(0.4+fire*0.82+fres*0.4,0.0,1.0);
} else { float e=fbm(dom+vec3(t*0.8,-t*0.5,t*0.35)); float fil=pow(1.0-abs(e*2.0-1.0),9.0); float e2=fbm(dom*1.7+vec3(-t*0.6,t*0.7,-t*0.4)); float fil2=pow(1.0-abs(e2*2.0-1.0),12.0); float arc=max(fil,fil2); float flick=0.55+0.45*sin(t*8.0+e*12.0); color=mix(uTint*0.22,uGlow,fres); color+=uGlow*arc*flick*1.9; color+=vec3(0.8,0.94,1.0)*pow(arc,1.6)*flick; alpha=clamp(mix(0.12,0.42,fres)+arc*0.7,0.0,1.0); }
color*=mix(0.7,1.25,vState);
${dither ? "if(alpha<bayer(gl_FragCoord.xy)) discard; gl_FragColor=vec4(color,1.0);" : "gl_FragColor=vec4(color,alpha);"} }` });
    this.material.alphaToCoverage = !dither;
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
