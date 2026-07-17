"use client";

import Link from "next/link";
import type { CatalogApp } from "@/lib/catalog-builder";

export function AppGrid({ apps, compact = false }: { apps: CatalogApp[]; compact?: boolean }) {
  if (!apps.length) return <div className="empty-catalog"><p>No opted-in apps are live yet.</p><span>Add the <strong>macscott-app</strong> topic and a valid <strong>macscott.json</strong> to publish one.</span></div>;
  return (
    <div className={compact ? "app-strip" : "app-grid"} aria-label="App catalog">
      {apps.map((app) => (
        <Link className="app-card" href={`/apps/${app.slug}`} key={app.slug} onClick={() => sessionStorage.setItem("macscott:last-app", app.slug)} style={{ "--app-accent": app.accent } as React.CSSProperties}>
          <div className="app-preview" style={app.screenshotUrl ? { backgroundImage: `linear-gradient(0deg, #05050899, transparent), url("${app.screenshotUrl.replaceAll('"', '%22')}")` } : { background: `radial-gradient(circle at 35% 30%, ${app.accent}, #080912 65%)` }} role="img" aria-label={app.screenshotUrl ? `${app.title} preview` : `${app.title} generated preview`} />
          <div className="app-copy"><span>{app.owner === "both" ? "SHARED" : app.owner.toUpperCase()} {"·"} {app.liveUrl ? "LIVE" : "IN DEVELOPMENT"}</span><h2>{app.title}</h2>{!compact && <p>{app.description}</p>}</div>
        </Link>
      ))}
    </div>
  );
}
