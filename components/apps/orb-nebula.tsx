"use client";

import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, Float, Html, Image as DreiImage, MeshTransmissionMaterial, OrbitControls, Stars } from "@react-three/drei";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { CatalogApp } from "@/lib/catalog-builder";

type Tier = "full" | "lite";

function PreviewPlane({ url }: { url: string }) {
  // Billboarded and pushed past the glass surface (sphere radius .86) so the
  // screenshot stays crisp instead of being refracted inside the orb.
  return (
    <Billboard>
      <DreiImage url={url} scale={[1.35, .84]} position={[0, 0, .98]} transparent />
    </Billboard>
  );
}

// OrbitControls never damps its dolly, so wheel zoom snaps. We disable its zoom
// and drive camera distance ourselves with an exponentially damped target.
function SmoothZoom({ min, max, diveLock }: { min: number; max: number; diveLock: { current: boolean } }) {
  const target = useRef(8);
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const element = gl.domElement;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      target.current = THREE.MathUtils.clamp(target.current * Math.exp(event.deltaY * .0011), min, max);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [gl, min, max]);
  useFrame((state, delta) => {
    if (diveLock.current) return;
    const distance = state.camera.position.length();
    state.camera.position.setLength(THREE.MathUtils.damp(distance, target.current, 5, delta));
  });
  return null;
}

function Orb({ app, index, tier, reducedMotion, diveLock }: { app: CatalogApp; index: number; tier: Tier; reducedMotion: boolean; diveLock: { current: boolean } }) {
  const group = useRef<THREE.Group>(null);
  const sphere = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const diving = useRef(false);
  const diveElapsed = useRef(0);
  const router = useRouter();
  const angle = index * 2.399;
  const radius = 2.5 + (index % 4) * 1.45;
  const position = useMemo<[number, number, number]>(() => [Math.cos(angle) * radius, ((index % 3) - 1) * 1.6, -Math.sin(angle) * radius - index * .35], [angle, index, radius]);
  useFrame((state, delta) => {
    if (!group.current || reducedMotion) return;
    if (diving.current) {
      const destination = new THREE.Vector3();
      group.current.getWorldPosition(destination);
      state.camera.position.lerp(destination, Math.min(.12, delta * 3.5));
      state.camera.lookAt(destination);
      diveElapsed.current += delta;
      if (diveElapsed.current > .7) { diving.current = false; diveLock.current = false; sessionStorage.setItem("macscott:last-app", app.slug); router.push(`/apps/${app.slug}`); }
      return;
    }
    if (sphere.current) sphere.current.rotation.y += delta * .1;
    const pointerPull = hovered ? .16 : .035;
    group.current.position.x += (position[0] + state.pointer.x * pointerPull - group.current.position.x) * .035;
    group.current.position.y += (position[1] + state.pointer.y * pointerPull - group.current.position.y) * .035;
  });
  return (
    <Float speed={reducedMotion ? 0 : .8} rotationIntensity={reducedMotion ? 0 : .18} floatIntensity={reducedMotion ? 0 : .35}>
      <group ref={group} position={position} onClick={(event) => { event.stopPropagation(); sessionStorage.setItem("macscott:last-app", app.slug); if (reducedMotion) router.push(`/apps/${app.slug}`); else { diving.current = true; diveLock.current = true; } }} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
        <mesh ref={sphere} scale={hovered ? 1.12 : 1}>
          <sphereGeometry args={[.86, tier === "full" ? 48 : 24, tier === "full" ? 48 : 24]} />
          {tier === "full" ? <MeshTransmissionMaterial backside chromaticAberration={.05} distortion={.12} distortionScale={.2} thickness={.5} roughness={.08} clearcoat={1} clearcoatRoughness={.12} color={app.accent} transmission={1} /> : <meshStandardMaterial color={app.accent} metalness={.3} roughness={.22} transparent opacity={.72} />}
        </mesh>
        {app.screenshotUrl && <PreviewPlane url={app.screenshotUrl} />}
        <pointLight color={app.accent} intensity={hovered ? 3 : 1} distance={5} />
        <Html center position={[0, -1.22, 0]} className={`orb-label${hovered ? " hovered" : ""}`}><span>{app.title}</span><small>{app.liveUrl ? "ENTER" : "IN DEVELOPMENT"}</small></Html>
      </group>
    </Float>
  );
}

function Atmosphere({ color, tier }: { color: string; tier: Tier }) {
  const count = tier === "full" ? 900 : 220;
  const points = useMemo(() => {
    const values = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      values[index * 3] = (Math.random() - .5) * 24;
      values[index * 3 + 1] = (Math.random() - .5) * 14;
      values[index * 3 + 2] = (Math.random() - .5) * 24;
    }
    return values;
  }, [count]);
  return <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[points, 3]} /></bufferGeometry><pointsMaterial color={color} size={tier === "full" ? .035 : .025} transparent opacity={.75} depthWrite={false} /></points>;
}

export default function OrbNebula({ apps, tier, reducedMotion, onContextLost }: { apps: CatalogApp[]; tier: Tier; reducedMotion: boolean; onContextLost: () => void }) {
  const accent = apps[0]?.accent ?? "#ff8a00";
  const diveLock = useRef(false);
  return (
    <Canvas dpr={tier === "full" ? [1, 1.75] : 1} camera={{ position: [0, 0, 8], fov: 55 }} gl={{ antialias: tier === "full", powerPreference: tier === "full" ? "high-performance" : "low-power" }} onCreated={({ gl }) => gl.domElement.addEventListener("webglcontextlost", (event) => { event.preventDefault(); onContextLost(); }, { once: true })}>
      <color attach="background" args={["#030306"]} />
      <fog attach="fog" args={["#030306", 12, 42]} />
      <ambientLight intensity={.45} />
      <directionalLight intensity={1.15} position={[6, 7, 4]} />
      <directionalLight color="#8fb4ff" intensity={.45} position={[-6, -3, -6]} />
      <Stars radius={60} depth={30} count={tier === "full" ? 1800 : 450} factor={2} fade speed={reducedMotion ? 0 : .15} />
      <Atmosphere color={accent} tier={tier} />
      {apps.map((app, index) => <Orb app={app} diveLock={diveLock} index={index} key={app.slug} reducedMotion={reducedMotion} tier={tier} />)}
      <SmoothZoom diveLock={diveLock} max={14} min={3.2} />
      <OrbitControls enablePan={false} enableZoom={false} enableDamping dampingFactor={.06} minDistance={3} maxDistance={14} autoRotate={!reducedMotion} autoRotateSpeed={.18} />
      {tier === "full" && <EffectComposer><Bloom intensity={.8} luminanceThreshold={.2} mipmapBlur /></EffectComposer>}
    </Canvas>
  );
}
