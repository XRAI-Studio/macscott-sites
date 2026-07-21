"use client";

import type { RefObject } from "react";
import { createRef } from "react";
import * as THREE from "three";
import type { CatalogApp } from "@/lib/catalog-builder";

type Label = { ref: RefObject<HTMLDivElement | null>; width: number; height: number };

export class LabelManager {
  readonly labels: Label[];
  private readonly point = new THREE.Vector3();
  private readonly rectangles = new Float32Array(24 * 4);
  private readonly regions = new Uint8Array(4);

  constructor(apps: CatalogApp[]) { this.labels = apps.map((app) => ({ ref: createRef<HTMLDivElement>(), width: Math.min(176, Math.max(96, app.title.length * 8 + 28)), height: 47 })); }

  update(camera: THREE.Camera, centers: Float32Array, hovered: number, width: number, height: number) {
    this.regions.fill(0); let accepted = 0;
    for (let pass = 0; pass < 2; pass += 1) for (let index = 0; index < this.labels.length; index += 1) {
      if ((pass === 0) !== (index === hovered)) continue;
      const label = this.labels[index], element = label.ref.current; if (!element) continue;
      const offset = index * 3; this.point.set(centers[offset], centers[offset + 1] - 1.15, centers[offset + 2]);
      const distance = this.point.distanceTo(camera.position); this.point.project(camera);
      const visible = this.point.z > -1 && this.point.z < 1 && distance <= 11.2 && Math.abs(this.point.x) < .96 && Math.abs(this.point.y) < .96;
      const x = (this.point.x * .5 + .5) * width, y = (-this.point.y * .5 + .5) * height, left = x - label.width / 2, top = y - label.height / 2, region = (x >= width / 2 ? 1 : 0) + (y >= height / 2 ? 2 : 0);
      let overlap = false;
      if (visible && index !== hovered && this.regions[region]) for (let slot = 0; slot < accepted; slot += 1) { const at = slot * 4; if (left < this.rectangles[at + 2] && left + label.width > this.rectangles[at] && top < this.rectangles[at + 3] && top + label.height > this.rectangles[at + 1]) { overlap = true; break; } }
      if (visible && (!overlap || !this.regions[region] || index === hovered)) {
        const at = accepted++ * 4; this.rectangles[at] = left; this.rectangles[at + 1] = top; this.rectangles[at + 2] = left + label.width; this.rectangles[at + 3] = top + label.height; this.regions[region] = 1;
        element.style.transform = `translate3d(${left}px,${top}px,0)`; element.style.opacity = "1"; element.style.visibility = "visible";
      } else { element.style.opacity = "0"; element.style.visibility = "hidden"; }
    }
  }
}

export function NebulaLabels({ apps, manager }: { apps: CatalogApp[]; manager: LabelManager }) {
  return <div className="nebula-labels" aria-hidden="true">{apps.map((app, index) => <div className="orb-label" key={app.slug} ref={manager.labels[index].ref} style={{ width: manager.labels[index].width }}><span>{app.title}</span><small>{app.liveUrl ? "ENTER" : "IN DEVELOPMENT"}</small></div>)}</div>;
}
