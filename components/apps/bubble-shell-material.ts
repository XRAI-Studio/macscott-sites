import * as THREE from "three";
import type { NebulaTheme } from "@/lib/nebula-theme";

export class BubbleShellResources {
  readonly geometry: THREE.SphereGeometry;
  readonly material: THREE.ShaderMaterial;
  readonly state: THREE.InstancedBufferAttribute;

  constructor(theme: NebulaTheme, count: number, tier: "full" | "lite", webgl2: boolean) {
    this.geometry = new THREE.SphereGeometry(.86, tier === "full" ? 24 : 16, tier === "full" ? 16 : 12);
    this.state = new THREE.InstancedBufferAttribute(new Float32Array(count), 1); this.geometry.setAttribute("aState", this.state);
    const dither = !webgl2 || tier === "lite";
    this.material = new THREE.ShaderMaterial({ transparent: !dither, depthTest: true, depthWrite: true, side: THREE.DoubleSide,
      uniforms: { uTint: { value: new THREE.Color(theme.shellTint) }, uGlow: { value: new THREE.Color(theme.palette.glow) }, uLightning: { value: theme.effect === "lightning" ? 1 : 0 }, uIridescence: { value: tier === "full" ? 1 : 0 } },
      vertexShader: `attribute float aState; varying vec3 vNormal; varying vec3 vView; varying vec3 vWorld; varying float vState; void main(){ vec4 local=vec4(position,1.); vec3 normalLocal=normal;
#ifdef USE_INSTANCING
local=instanceMatrix*local; normalLocal=mat3(instanceMatrix)*normalLocal;
#endif
vec4 world=modelMatrix*local; vec4 view=modelViewMatrix*local; vNormal=normalize(normalMatrix*normalLocal); vView=normalize(-view.xyz); vWorld=world.xyz; vState=aState; gl_Position=projectionMatrix*view; }`,
      fragmentShader: `uniform vec3 uTint; uniform vec3 uGlow; uniform float uLightning; uniform float uIridescence; varying vec3 vNormal; varying vec3 vView; varying vec3 vWorld; varying float vState; float bayer(vec2 p){ vec2 q=mod(floor(p),4.); float x=q.x, y=q.y; return (mod(x,2.)*8.+mod(y,2.)*4.+mod(floor(x/2.),2.)*2.+mod(floor(y/2.),2.)+.5)/16.; } void main(){ float fres=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),2.15); float vein=pow(max(0.,sin(vWorld.y*24.+vWorld.x*13.)*sin(vWorld.z*19.-vWorld.y*8.)),10.)*uLightning; vec3 rainbow=.5+.5*cos(vec3(0.,2.1,4.2)+fres*7.); vec3 color=mix(uTint,uGlow,fres*.72)+rainbow*fres*.12*uIridescence+uGlow*vein*.55; float alpha=mix(.13,.42,fres)*mix(.55,1.25,vState)+vein*.18; ${dither ? "if(alpha<bayer(gl_FragCoord.xy)) discard; gl_FragColor=vec4(color,1.);" : "gl_FragColor=vec4(color,alpha);"} }` });
    this.material.alphaToCoverage = !dither;
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
