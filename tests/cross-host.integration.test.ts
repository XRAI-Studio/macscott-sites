import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { get } from "node:http";
import path from "node:path";

const enabled = process.env.RUN_INTEGRATION === "1";
const port = 3217;
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
let server: ChildProcess | undefined;

function requestText(pathname: string, host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    get({ hostname: "127.0.0.1", port, path: pathname, headers: { Host: host } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
    }).on("error", reject);
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { const response = await requestText("/", "scott.macscott.net"); if (response.status === 200) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("next start did not become ready");
}

describe.skipIf(!enabled)("production cross-host isolation", () => {
  beforeAll(async () => {
    execFileSync(process.execPath, [nextBin, "build"], { cwd: process.cwd(), env: { ...process.env, GITHUB_TOKEN: "" }, stdio: "inherit" });
    server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], { cwd: process.cwd(), env: { ...process.env, GITHUB_TOKEN: "", VERCEL_ENV: "preview" }, stdio: "inherit" });
    await waitForServer();
  }, 120_000);

  afterAll(() => {
    if (!server?.pid) return;
    if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  });

  it.each([
    ["/", "Scott MacScott", "Alexander MacScott"],
    ["/blog", "Veronica", "HAL"],
    ["/rss.xml", "Scott MacScott", "Alexander MacScott"],
  ])("serves distinct content for %s", async (pathname, scottText, alexanderText) => {
    const [scottResponse, alexanderResponse] = await Promise.all([
      requestText(pathname, "scott.macscott.net"),
      requestText(pathname, "alexander.macscott.net"),
    ]);
    expect(scottResponse.status).toBe(200);
    expect(alexanderResponse.status).toBe(200);
    const scott = scottResponse.body;
    const alexander = alexanderResponse.body;
    expect(scott).toContain(scottText);
    expect(scott).not.toContain(alexanderText);
    expect(alexander).toContain(alexanderText);
    expect(alexander).not.toContain(scottText);
  });
});
