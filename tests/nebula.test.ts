import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { AppsExperience } from "@/components/apps/apps-experience";
import type { CatalogApp } from "@/lib/catalog-builder";
import { nebulaTheme } from "@/lib/nebula-theme";
import { LIGHTNING_SEGMENT_CAPACITY } from "@/components/apps/lightning-segments";
import { MAX_ORBS, SimulationState, slugAnchor } from "@/components/apps/nebula-simulation";
import { createNebulaRenderer, installRendererContextHandlers } from "@/components/apps/nebula-renderer";

const app = (slug: string, title: string): CatalogApp => ({
  schemaVersion: 1, slug, title, description: `${title} description`, owner: "both", accent: "#abcdef", embeddable: false,
  account: "owner", repo: slug, githubUrl: `https://github.com/owner/${slug}`, commitSha: "abc", screenshotUrl: null,
});

describe("nebula theme", () => {
  it("derives Scott fire colors from the tenant palette", () => {
    expect(nebulaTheme("scott")).toEqual({ effect: "fire", palette: { core: "#ffbf00", mid: "#ff5a1f", glow: "#ff8a00" }, shellTint: "#ffbf00" });
  });

  it("derives Alexander lightning colors from the tenant palette", () => {
    expect(nebulaTheme("alexander")).toEqual({ effect: "lightning", palette: { core: "#367cff", mid: "#1034ff", glow: "#00b7ff" }, shellTint: "#367cff" });
  });
});

describe("nebula semantic catalog", () => {
  it("keeps every app link in an inert hidden catalog", () => {
    const html = renderToStaticMarkup(createElement(AppsExperience, { apps: [app("first", "First"), app("second", "Second")], theme: nebulaTheme("scott"), requestedTier: "lite" }));
    expect(html).toContain('class="catalog-nebula-semantic"');
    expect(html).toContain("inert=\"\"");
    expect(html).toContain('href="/apps/first"');
    expect(html).toContain('href="/apps/second"');
  });

  it("caps a 100-app GPU surface without removing semantic overflow links", () => {
    const apps = Array.from({ length: 100 }, (_, index) => app(`app-${index}`, `App ${index}`));
    const html = renderToStaticMarkup(createElement(AppsExperience, { apps, theme: nebulaTheme("alexander"), requestedTier: "lite" }));
    expect(html).toContain("24 of 100 shown · Grid View for all apps");
    expect(html).toContain('href="/apps/app-99"');
  });
});

describe("nebula bounded pools", () => {
  it("uses deterministic slug anchors and the frozen hard capacities", () => {
    expect(slugAnchor("first")).toEqual(slugAnchor("first"));
    expect(slugAnchor("first")).not.toEqual(slugAnchor("second"));
    expect(MAX_ORBS).toBe(24);
    expect(LIGHTNING_SEGMENT_CAPACITY).toBe(24 * 6 * 8);
  });

  it("caps simulation speed after a hidden-tab sized delta", () => {
    const simulation = new SimulationState(["first", "second"]);
    simulation.step(.8, 0, null);
    for (let index = 0; index < simulation.count; index += 1) {
      const offset = index * 3;
      expect(Math.hypot(simulation.velocities[offset], simulation.velocities[offset + 1], simulation.velocities[offset + 2])).toBeLessThanOrEqual(1.401);
    }
  });

  it.each([1, 10, 24])("keeps %i simulated orbs finite and camera-bounded", (count) => {
    const camera = new THREE.PerspectiveCamera(55, 1.44, .1, 100); camera.position.set(0, 0, 9.2); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    const simulation = new SimulationState(Array.from({ length: count }, (_, index) => `bounded-${index}`));
    for (let frame = 0; frame < 600; frame += 1) simulation.step(1 / 60, frame / 60, camera);
    for (let index = 0; index < simulation.count; index += 1) {
      const offset = index * 3, distance = Math.hypot(simulation.renderPositions[offset] - camera.position.x, simulation.renderPositions[offset + 1] - camera.position.y, simulation.renderPositions[offset + 2] - camera.position.z);
      expect(Number.isFinite(distance)).toBe(true); expect(distance).toBeGreaterThanOrEqual(5); expect(distance).toBeLessThanOrEqual(11);
    }
  });

  it("gives every max-capacity pair eight pixels of projected clearance within 30 seconds", () => {
    const width = 1440, height = 1000, camera = new THREE.PerspectiveCamera(55, width / height, .1, 100); camera.position.set(0, 0, 9.2); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    const simulation = new SimulationState(Array.from({ length: 24 }, (_, index) => `clearance-${index}`));
    const maximum = new Float32Array(24 * 24); maximum.fill(-Infinity); const projected = Array.from({ length: 24 }, () => new THREE.Vector3()), view = new THREE.Vector3();
    for (let frame = 0; frame < 1800; frame += 1) {
      simulation.step(1 / 60, frame / 60, camera);
      for (let index = 0; index < 24; index += 1) { const offset = index * 3; projected[index].set(simulation.renderPositions[offset], simulation.renderPositions[offset + 1], simulation.renderPositions[offset + 2]).project(camera); }
      for (let left = 0; left < 24; left += 1) for (let right = left + 1; right < 24; right += 1) {
        const lo = left * 3, ro = right * 3, lx = (projected[left].x * .5 + .5) * width, ly = (-projected[left].y * .5 + .5) * height, rx = (projected[right].x * .5 + .5) * width, ry = (-projected[right].y * .5 + .5) * height;
        view.set(simulation.renderPositions[lo], simulation.renderPositions[lo + 1], simulation.renderPositions[lo + 2]).applyMatrix4(camera.matrixWorldInverse); const leftRadius = .86 * height / (2 * Math.tan(THREE.MathUtils.degToRad(55 / 2)) * -view.z);
        view.set(simulation.renderPositions[ro], simulation.renderPositions[ro + 1], simulation.renderPositions[ro + 2]).applyMatrix4(camera.matrixWorldInverse); const rightRadius = .86 * height / (2 * Math.tan(THREE.MathUtils.degToRad(55 / 2)) * -view.z);
        maximum[left * 24 + right] = Math.max(maximum[left * 24 + right], Math.hypot(lx - rx, ly - ry) - leftRadius - rightRadius);
      }
    }
    for (let left = 0; left < 24; left += 1) for (let right = left + 1; right < 24; right += 1) expect(maximum[left * 24 + right]).toBeGreaterThanOrEqual(8);
  });
});

describe("nebula renderer failures", () => {
  it("does not fallback after successful renderer construction", () => {
    const failure = vi.fn(), renderer = { debug: { checkShaderErrors: true, onShaderError: null } } as unknown as THREE.WebGLRenderer;
    expect(createNebulaRenderer({} as THREE.WebGLRendererParameters, "full", failure, () => renderer)).toBe(renderer);
    expect(failure).not.toHaveBeenCalled();
  });

  it("falls back on renderer creation or shader-link failure", () => {
    const failure = vi.fn(), creationError = new Error("context creation failed");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => createNebulaRenderer({} as THREE.WebGLRendererParameters, "full", failure, () => { throw creationError; })).toThrow(creationError);
    expect(failure).toHaveBeenCalledTimes(1);
    const renderer = { debug: { checkShaderErrors: true, onShaderError: null } } as unknown as THREE.WebGLRenderer;
    createNebulaRenderer({} as THREE.WebGLRendererParameters, "full", failure, () => renderer);
    type ShaderArgs = Parameters<NonNullable<THREE.WebGLRenderer["debug"]["onShaderError"]>>;
    renderer.debug.onShaderError?.({ getProgramInfoLog: () => "link failed", getShaderInfoLog: () => "compile failed" } as unknown as ShaderArgs[0], {} as ShaderArgs[1], {} as ShaderArgs[2], {} as ShaderArgs[3]);
    expect(failure).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it("falls back on context loss but not context restoration", () => {
    const target = new EventTarget(), failure = vi.fn(), canvas = { addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target), setAttribute: vi.fn() };
    const cleanup = installRendererContextHandlers(canvas, failure);
    const lost = new Event("webglcontextlost", { cancelable: true }); target.dispatchEvent(lost); target.dispatchEvent(new Event("webglcontextrestored"));
    expect(lost.defaultPrevented).toBe(true); expect(failure).toHaveBeenCalledTimes(1); expect(canvas.setAttribute).toHaveBeenCalledWith("aria-hidden", "true");
    cleanup();
  });
});
