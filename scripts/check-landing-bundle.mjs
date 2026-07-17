import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const root = process.cwd();
function clientManifest(relativePath) {
  const source = readFileSync(path.join(root, relativePath), "utf8");
  const marker = " = ";
  return JSON.parse(source.slice(source.lastIndexOf(marker) + marker.length).replace(/;\s*$/, ""));
}

function sizes(files) {
  const unique = [...new Set(files)];
  const buffers = unique.map((file) => readFileSync(path.join(root, ".next", file)));
  return {
    files: unique,
    raw: unique.reduce((sum, file) => sum + statSync(path.join(root, ".next", file)).size, 0),
    gzip: buffers.reduce((sum, buffer) => sum + gzipSync(buffer).length, 0),
    has3d: buffers.some((buffer) => /MeshTransmissionMaterial|WebGLRenderer|react-three|postprocessing/.test(buffer.toString("utf8"))),
  };
}

function entryFiles(manifest, entry) {
  return manifest.entryJSFiles[entry] ?? [];
}

const landingManifest = clientManifest(path.join(".next", "server", "app", "t", "[tenant]", "route_client-reference-manifest.js"));
const appsManifest = clientManifest(path.join(".next", "server", "app", "t", "[tenant]", "apps", "page_client-reference-manifest.js"));
const dynamicManifest = JSON.parse(readFileSync(path.join(root, ".next", "server", "app", "t", "[tenant]", "apps", "page", "react-loadable-manifest.json"), "utf8"));

const landing = sizes(entryFiles(landingManifest, "[project]/app/t/[tenant]/route"));
const appsEntry = sizes(entryFiles(appsManifest, "[project]/app/t/[tenant]/apps/page"));
const appsDynamic = sizes(Object.values(dynamicManifest).flatMap((item) => item.files));
const kb = (value) => `${(value / 1024).toFixed(1)} KB`;

console.log("Route bundle table (emitted client chunks)");
console.table([
  { route: "/ (static landing)", files: landing.files.length, raw: kb(landing.raw), gzip: kb(landing.gzip), "3D signatures": landing.has3d ? "FOUND" : "none" },
  { route: "/apps bootstrap", files: appsEntry.files.length, raw: kb(appsEntry.raw), gzip: kb(appsEntry.gzip), "3D signatures": appsEntry.has3d ? "FOUND" : "none" },
  { route: "/apps lazy nebula", files: appsDynamic.files.length, raw: kb(appsDynamic.raw), gzip: kb(appsDynamic.gzip), "3D signatures": appsDynamic.has3d ? "present" : "MISSING" },
]);
if (landing.gzip > 110 * 1024) throw new Error(`Landing entry is ${kb(landing.gzip)}, above the 110 KB budget`);
if (landing.has3d) throw new Error("Landing entry contains a 3D-library signature");
if (!appsDynamic.has3d) throw new Error("Apps lazy chunk does not contain the expected 3D signature");
console.log("PASS: landing is below 110 KB gzip and has no three.js/R3F/postprocessing signature.");
