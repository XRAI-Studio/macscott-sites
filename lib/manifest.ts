import { z } from "zod";

export const SHOWCASE_ORIGINS = new Set([
  "https://scott.macscott.net",
  "https://alexander.macscott.net",
]);

const screenshotPath = z.string().min(1).max(240).refine((value) => {
  if (value.startsWith("/") || value.includes("\\") || value.includes("\0")) return false;
  const parts = value.split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..");
}, "screenshot must be a normalized in-repository relative path");

const httpsUrl = z.url().max(2048).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !SHOWCASE_ORIGINS.has(url.origin.toLowerCase());
}, "liveUrl must be HTTPS and hosted outside the showcase origins");

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  owner: z.enum(["scott", "alexander", "both"]),
  liveUrl: httpsUrl.optional(),
  embeddable: z.boolean().optional(),
  screenshot: screenshotPath.optional(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, "accent must be a six-digit hex color"),
}).strict();

export type AppManifest = Omit<z.infer<typeof manifestSchema>, "embeddable"> & { embeddable: boolean };

function accountOwner(account: string): "scott" | "alexander" {
  if (account.toLowerCase() === "xrai-studio") return "scott";
  if (account.toLowerCase() === "alexandermacscott-del") return "alexander";
  throw new Error(`Unrecognized catalog account: ${account}`);
}

export function parseManifest(input: unknown, account: string): AppManifest {
  const parsed = manifestSchema.parse(input);
  const expectedOwner = accountOwner(account);
  if (parsed.owner !== expectedOwner && parsed.owner !== "both") {
    throw new Error(`owner ${parsed.owner} cannot be published from ${account}`);
  }
  return {
    ...parsed,
    embeddable: parsed.liveUrl ? (parsed.embeddable ?? true) : false,
  };
}
