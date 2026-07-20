"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CatalogApp } from "@/lib/catalog-builder";

export function AppDetailOverlay({ app }: { app: CatalogApp }) {
  const router = useRouter();
  const overlay = useRef<HTMLDivElement>(null);
  const [minimized, setMinimized] = useState(false);
  const close = () => router.back();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = overlay.current;
    root?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "Tab" && root) {
        const nodes = [...root.querySelectorAll<HTMLElement>('button, a[href], iframe, [tabindex]:not([tabindex="-1"])')].filter((node) => !node.hasAttribute("disabled"));
        if (!nodes.length) { event.preventDefault(); return; }
        const first = nodes[0]; const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, []);

  const playable = Boolean(app.liveUrl && app.embeddable);
  return (
    <div aria-label={`${app.title} app showcase`} aria-modal="true" className="app-overlay" ref={overlay} role="dialog" tabIndex={-1}>
      <div className="app-overlay-bar"><button onClick={close} type="button">← BACK TO NEBULA</button><span>{app.owner === "both" ? "SHARED APP" : `${app.owner.toUpperCase()} APP`}</span>{app.liveUrl ? <a href={app.liveUrl} rel="noreferrer" target="_blank">OPEN IN NEW TAB ↗</a> : <a href={app.githubUrl} rel="noreferrer" target="_blank">VIEW ON GITHUB ↗</a>}</div>
      <div className={`app-runtime ${playable ? "playable" : "dormant"}`}>
        {playable && <iframe allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'; clipboard-read 'none'; clipboard-write 'none'" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups" src={app.liveUrl} title={app.title} />}
        {!playable && <div className="dormant-orb" style={{ "--app-accent": app.accent } as React.CSSProperties}><span>IN DEVELOPMENT</span></div>}
        {minimized ? (
          <button className="detail-card-restore" onClick={() => setMinimized(false)} type="button">
            <span className="eyebrow">{playable ? "NOW RUNNING" : app.liveUrl ? "EXTERNAL LAUNCH" : "DORMANT ORB"}</span>
            <span className="detail-card-restore-title">{app.title}</span>
            <span aria-hidden="true">▢</span>
          </button>
        ) : (
          <aside className="detail-card">
            <button aria-label="Minimize details" className="detail-card-minimize" onClick={() => setMinimized(true)} title="Minimize" type="button">–</button>
            <p className="eyebrow">{playable ? "NOW RUNNING" : app.liveUrl ? "EXTERNAL LAUNCH" : "DORMANT ORB"}</p><h1>{app.title}</h1><p>{app.description}</p><div className="cta-row"><a className="button" href={app.githubUrl} rel="noreferrer" target="_blank">GitHub ↗</a>{app.liveUrl && <a className="button secondary" href={app.liveUrl} rel="noreferrer" target="_blank">Open app ↗</a>}</div>
          </aside>
        )}
      </div>
    </div>
  );
}
