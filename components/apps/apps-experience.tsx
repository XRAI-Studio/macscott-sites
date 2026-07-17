"use client";

import dynamic from "next/dynamic";
import { getGPUTier } from "detect-gpu";
import { useEffect, useState } from "react";
import type { CatalogApp } from "@/lib/catalog-builder";
import { AppGrid } from "./app-grid";

const OrbNebula = dynamic(() => import("./orb-nebula"), { ssr: false, loading: () => <div className="nebula-loading">Igniting the nebula…</div> });
type Tier = "full" | "lite" | "off";

function supportsWebGL() {
  try { const canvas = document.createElement("canvas"); return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl")); } catch { return false; }
}

export function AppsExperience({ apps, requestedTier }: { apps: CatalogApp[]; requestedTier?: Tier }) {
  const [gridOnly, setGridOnly] = useState(requestedTier === "off");
  const [contextLost, setContextLost] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [tier, setTier] = useState<Tier>(requestedTier ?? "lite");

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener("change", update);
    if (!supportsWebGL()) setGridOnly(true);
    if (!requestedTier) getGPUTier().then((gpu) => setTier(gpu.tier <= 1 || gpu.isMobile ? "lite" : "full")).catch(() => setTier("lite"));
    const lastApp = sessionStorage.getItem("macscott:last-app");
    if (lastApp) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`a[href="/apps/${CSS.escape(lastApp)}"]`)?.focus());
      sessionStorage.removeItem("macscott:last-app");
    }
    return () => media.removeEventListener("change", update);
  }, [requestedTier]);

  return (
    <div className={`apps-experience ${gridOnly ? "is-grid" : "is-nebula"}`}>
      <div className="view-controls" role="group" aria-label="Catalog view">
        <button aria-pressed={!gridOnly} disabled={contextLost || tier === "off"} onClick={() => setGridOnly(false)} type="button">NEBULA</button>
        <button aria-pressed={gridOnly} onClick={() => setGridOnly(true)} type="button">GRID VIEW</button>
        <span>{contextLost ? "WEBGL CONTEXT LOST — GRID ACTIVE" : `${tier.toUpperCase()} TIER`}</span>
      </div>
      {!gridOnly && <div className="nebula-stage"><OrbNebula apps={apps} onContextLost={() => { setContextLost(true); setGridOnly(true); }} reducedMotion={reducedMotion} tier={tier === "off" ? "lite" : tier} /></div>}
      <section className={gridOnly ? "catalog-full" : "catalog-dock"} aria-labelledby="catalog-heading">
        <h2 className="sr-only" id="catalog-heading">Semantic app catalog</h2>
        <AppGrid apps={apps} compact={!gridOnly} />
      </section>
    </div>
  );
}
