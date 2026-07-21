"use client";

import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { CatalogApp } from "@/lib/catalog-builder";
import type { NebulaTheme } from "@/lib/nebula-theme";
import { BubbleShellResources } from "./bubble-shell-material";
import { FirePoints } from "./fire-points";
import { LabelManager, NebulaLabels } from "./label-manager";
import { LightningSegments } from "./lightning-segments";
import { createNebulaRenderer, installRendererContextHandlers } from "./nebula-renderer";
import { SimulationState } from "./nebula-simulation";

type Tier = "full" | "lite";
type Failure = () => void;

function RendererGuard({ onFailure }: { onFailure: Failure }) {
  const { gl } = useThree();
  useEffect(() => installRendererContextHandlers(gl.domElement, onFailure), [gl, onFailure]);
  return null;
}

function Atmosphere({ color, tier }: { color: string; tier: Tier }) {
  const count = tier === "full" ? 720 : 220;
  const values = useMemo(() => {
    const result = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) { const offset = index * 3, seed = Math.sin(index * 81.13) * 43758.5453; result[offset] = ((seed % 1) - .5) * 22; result[offset + 1] = (((seed * 3.1) % 1) - .5) * 13; result[offset + 2] = (((seed * 7.7) % 1) - .5) * 22; }
    return result;
  }, [count]);
  return <points raycast={() => null}><bufferGeometry><bufferAttribute attach="attributes-position" args={[values, 3]} /></bufferGeometry><pointsMaterial color={color} depthWrite={false} opacity={.58} size={tier === "full" ? .032 : .022} transparent /></points>;
}

function NebulaSimulation({ apps, labels, onPerformanceFallback, reducedMotion, theme, tier }: { apps: CatalogApp[]; labels: LabelManager; onPerformanceFallback: Failure; reducedMotion: boolean; theme: NebulaTheme; tier: Tier }) {
  const { camera, gl, pointer, size } = useThree();
  const router = useRouter();
  const shellMesh = useRef<THREE.InstancedMesh>(null);
  const hoverLight = useRef<THREE.PointLight>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  const simulation = useRef<SimulationState | null>(null); if (!simulation.current) simulation.current = new SimulationState(apps.map((app) => app.slug));
  const webgl2 = gl.capabilities.isWebGL2;
  const shell = useMemo(() => new BubbleShellResources(theme, apps.length, tier, webgl2), [apps.length, theme, tier, webgl2]);
  const fire = useMemo(() => theme.effect === "fire" ? new FirePoints(theme, tier, webgl2, simulation.current!.renderPositions) : null, [theme, tier, webgl2]);
  const lightning = useMemo(() => theme.effect === "lightning" ? new LightningSegments(theme, tier, webgl2, simulation.current!.renderPositions) : null, [theme, tier, webgl2]);
  const matrix = useRef(new THREE.Matrix4());
  const destination = useRef(new THREE.Vector3());
  const hovered = useRef(-1), diving = useRef(-1), diveElapsed = useRef(0), simTime = useRef(0), frame = useRef(0), zoomTarget = useRef(9.2), slowFrames = useRef(0), fallbackSent = useRef(false), visible = useRef(true), staticWritten = useRef(false);

  // These pools belong to this Canvas instance; R3F is told not to dispose the shared shell twice.
  useEffect(() => () => { shell.dispose(); fire?.dispose(); lightning?.dispose(); }, [fire, lightning, shell]);
  useEffect(() => {
    function handleVisibilityChange() { visible.current = !document.hidden; }
    function handleWheel(event: WheelEvent) { event.preventDefault(); zoomTarget.current = THREE.MathUtils.clamp(zoomTarget.current * Math.exp(event.deltaY * .0011), 5, 11); }
    document.addEventListener("visibilitychange", handleVisibilityChange); gl.domElement.addEventListener("wheel", handleWheel, { passive: false });
    return () => { document.removeEventListener("visibilitychange", handleVisibilityChange); gl.domElement.removeEventListener("wheel", handleWheel); };
  }, [gl]);

  useFrame((_state, rawDelta) => {
    if (!visible.current) return;
    const delta = Math.min(rawDelta, 1 / 30), active = diving.current;
    if (controls.current) controls.current.enabled = active < 0;
    if (active >= 0) {
      const offset = active * 3; destination.current.set(simulation.current!.renderPositions[offset], simulation.current!.renderPositions[offset + 1], simulation.current!.renderPositions[offset + 2]);
      camera.position.lerp(destination.current, Math.min(.12, delta * 3.5)); camera.lookAt(destination.current); diveElapsed.current += delta;
      if (diveElapsed.current > .7) { const app = apps[active]; diving.current = -1; sessionStorage.setItem("macscott:last-app", app.slug); router.push(`/apps/${app.slug}`); }
    } else if (!reducedMotion) camera.position.setLength(THREE.MathUtils.damp(camera.position.length(), zoomTarget.current, 5, delta));
    if (!reducedMotion) { simTime.current += delta; simulation.current!.step(delta, simTime.current, camera, pointer.x, pointer.y, hovered.current, diving.current); staticWritten.current = false; }
    else if (!staticWritten.current) simulation.current!.step(0, 0, camera);
    if (!reducedMotion || !staticWritten.current) {
      const positions = simulation.current!.renderPositions;
      for (let index = 0; index < apps.length; index += 1) {
        const offset = index * 3, scale = index === hovered.current ? 1.12 : 1;
        matrix.current.makeScale(scale, scale, scale); matrix.current.setPosition(positions[offset], positions[offset + 1], positions[offset + 2]); shellMesh.current?.setMatrixAt(index, matrix.current);
        (shell.state.array as Float32Array)[index] = reducedMotion ? .58 : index === hovered.current ? 1 : apps[index].liveUrl ? .42 : .22;
      }
      if (shellMesh.current) shellMesh.current.instanceMatrix.needsUpdate = true;
      shell.state.needsUpdate = true; staticWritten.current = true;
    }
    const positions = simulation.current!.renderPositions;
    if (hoverLight.current) { const offset = Math.max(0, hovered.current) * 3; hoverLight.current.position.set(positions[offset], positions[offset + 1], positions[offset + 2]); hoverLight.current.intensity = hovered.current < 0 ? 0 : 2.2; }
    labels.update(camera, positions, diving.current >= 0 ? diving.current : hovered.current, size.width, size.height);
    if (!reducedMotion) { fire?.update(simTime.current, hovered.current, apps.length); lightning?.update(simTime.current, hovered.current, apps.length, frame.current, size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio()); frame.current += 1; }
    if (tier === "full" && !fallbackSent.current) { slowFrames.current = rawDelta > .026 ? slowFrames.current + 1 : Math.max(0, slowFrames.current - 2); if (slowFrames.current > 150) { fallbackSent.current = true; onPerformanceFallback(); } }
  });

  function select(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation(); const index = event.instanceId ?? -1; if (index < 0) return;
    sessionStorage.setItem("macscott:last-app", apps[index].slug);
    if (reducedMotion) router.push(`/apps/${apps[index].slug}`); else { diving.current = index; diveElapsed.current = 0; }
  }
  function hover(event: ThreeEvent<PointerEvent>) { event.stopPropagation(); hovered.current = event.instanceId ?? -1; }
  function unhover() { hovered.current = -1; }

  return <>
    <instancedMesh args={[shell.geometry, shell.material, apps.length]} dispose={null} frustumCulled={false} onClick={select} onPointerMove={hover} onPointerOut={unhover} ref={shellMesh} />
    {!reducedMotion && fire && <primitive object={fire.points} />}{!reducedMotion && lightning && <primitive object={lightning.mesh} />}
    <pointLight color={theme.palette.glow} distance={4.5} intensity={0} ref={hoverLight} />
    <OrbitControls autoRotate={false} enableDamping enablePan={false} enableZoom={false} maxDistance={11} minDistance={5} ref={controls} />
  </>;
}

function Scene({ apps, labels, onFailure, onPerformanceFallback, reducedMotion, theme, tier }: { apps: CatalogApp[]; labels: LabelManager; onFailure: Failure; onPerformanceFallback: Failure; reducedMotion: boolean; theme: NebulaTheme; tier: Tier }) {
  return <>
    <color attach="background" args={["#030306"]} /><fog attach="fog" args={["#030306", 11, 25]} />
    <ambientLight intensity={.18} /><directionalLight color={theme.palette.glow} intensity={.42} position={[4, 6, 3]} />
    <Atmosphere color={theme.palette.glow} tier={tier} />
    <NebulaSimulation apps={apps} labels={labels} onPerformanceFallback={onPerformanceFallback} reducedMotion={reducedMotion} theme={theme} tier={tier} />
    <RendererGuard onFailure={onFailure} />
    {tier === "full" && <EffectComposer multisampling={4}><Bloom intensity={.7} luminanceThreshold={.25} mipmapBlur /></EffectComposer>}
  </>;
}

export default function OrbNebula({ apps, tier, reducedMotion, theme, onContextLost, onPerformanceFallback }: { apps: CatalogApp[]; tier: Tier; reducedMotion: boolean; theme: NebulaTheme; onContextLost: Failure; onPerformanceFallback: Failure }) {
  const labels = useMemo(() => new LabelManager(apps), [apps]);
  return <div aria-hidden="true" className="nebula-canvas"><Canvas aria-hidden="true" camera={{ position: [0, 0, 9.2], fov: 55 }} dpr={tier === "full" ? [1, 1.5] : 1} gl={(defaults) => createNebulaRenderer(defaults, tier, onContextLost)}><Scene apps={apps} labels={labels} onFailure={onContextLost} onPerformanceFallback={onPerformanceFallback} reducedMotion={reducedMotion} theme={theme} tier={tier} /></Canvas><NebulaLabels apps={apps} manager={labels} /></div>;
}
