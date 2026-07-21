"use client";

import dynamic from "next/dynamic";
import { getGPUTier } from "detect-gpu";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { CatalogApp } from "@/lib/catalog-builder";
import type { NebulaTheme } from "@/lib/nebula-theme";
import { AppGrid } from "./app-grid";

const OrbNebula = dynamic(() => import("./orb-nebula"), { ssr: false, loading: () => <div className="nebula-loading">Igniting the nebula…</div> });
type Tier = "full" | "lite" | "off";
let reducedQuery: MediaQueryList | null = null;
let reducedSnapshot: boolean | null = null;
const reducedListeners = new Set<() => void>();

function reducedMedia() {
  if (!reducedQuery) {
    reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedSnapshot = reducedQuery.matches;
    reducedQuery.addEventListener("change", () => { reducedSnapshot = reducedQuery?.matches ?? false; reducedListeners.forEach((listener) => listener()); });
  }
  return reducedQuery;
}

function subscribeReduced(listener: () => void) { reducedListeners.add(listener); reducedMedia(); return () => reducedListeners.delete(listener); }
function getReducedSnapshot() { reducedMedia(); return reducedSnapshot; }
function getServerReducedSnapshot(): null { return null; }

function supportsWebGL() {
  // Three r180 rejects WebGL1 contexts; WebGL1-only clients take the committed grid fallback.
  try { return Boolean(document.createElement("canvas").getContext("webgl2")); } catch { return false; }
}

export function AppsExperience({ apps, requestedTier, theme }: { apps: CatalogApp[]; requestedTier?: Tier; theme: NebulaTheme }) {
  const [gridOnly, setGridOnly] = useState(requestedTier === "off");
  const [contextLost, setContextLost] = useState(false);
  const [tier, setTier] = useState<Tier>(requestedTier ?? "lite");
  const reducedMotion = useSyncExternalStore(subscribeReduced, getReducedSnapshot, getServerReducedSnapshot);
  const visibleApps = apps.slice(0, 24);

  useEffect(() => {
    if (!supportsWebGL()) { setContextLost(true); setGridOnly(true); }
    if (!requestedTier) getGPUTier().then((gpu) => setTier(gpu.tier <= 1 || gpu.isMobile ? "lite" : "full")).catch(() => setTier("lite"));
    const lastApp = sessionStorage.getItem("macscott:last-app");
    if (lastApp) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`a[href="/apps/${CSS.escape(lastApp)}"]`)?.focus());
      sessionStorage.removeItem("macscott:last-app");
    }
  }, [requestedTier]);

  return (
    <div className={`apps-experience ${gridOnly ? "is-grid" : "is-nebula"}`}>
      <div className="view-controls" role="group" aria-label="Catalog view">
        <button aria-pressed={!gridOnly} disabled={contextLost || tier === "off"} onClick={() => setGridOnly(false)} type="button">NEBULA</button>
        <button aria-pressed={gridOnly} onClick={() => setGridOnly(true)} type="button">GRID VIEW</button>
        <span>{contextLost ? "WEBGL CONTEXT LOST — GRID ACTIVE" : `${tier.toUpperCase()} TIER`}</span>
      </div>
      {!gridOnly && apps.length === 0 && <div className="nebula-empty" role="status">No opted-in apps are live yet. Grid View explains how to publish one.</div>}
      {!gridOnly && apps.length > 24 && <div className="nebula-overflow" role="status">24 of {apps.length} shown · Grid View for all apps</div>}
      {!gridOnly && reducedMotion === null && <div className="nebula-loading">Preparing the nebula…</div>}
      {!gridOnly && reducedMotion !== null && visibleApps.length > 0 && <div className="nebula-stage"><OrbNebula apps={visibleApps} onContextLost={() => { setContextLost(true); setGridOnly(true); }} onPerformanceFallback={() => { if (!requestedTier && tier === "full") setTier("lite"); }} reducedMotion={reducedMotion} theme={theme} tier={tier === "off" ? "lite" : tier} /></div>}
      <section className={gridOnly ? "catalog-full" : "catalog-nebula-semantic"} aria-labelledby="catalog-heading" inert={gridOnly ? undefined : true}>
        <h2 className="sr-only" id="catalog-heading">Semantic app catalog</h2>
        <AppGrid apps={apps} compact={!gridOnly} />
      </section>
    </div>
  );
}
