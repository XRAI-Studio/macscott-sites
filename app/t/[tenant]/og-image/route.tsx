import { ImageResponse } from "next/og";
import { isTenant } from "@/lib/tenant";
import { getTenantContent } from "@/lib/tenant-content";

export async function GET(_request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if (!isTenant(tenant)) return new Response("Not found", { status: 404 });
  const content = getTenantContent(tenant);
  return new ImageResponse(
    <div style={{ alignItems: "center", background: `radial-gradient(circle at 22% 20%, ${content.colors.primary}55, transparent 42%), #050508`, color: "white", display: "flex", flexDirection: "column", height: "100%", justifyContent: "center", padding: 80, width: "100%" }}>
      <div style={{ color: content.colors.primary, display: "flex", fontSize: 22, fontWeight: 700, letterSpacing: 7 }}>{content.eyebrow}</div>
      <div style={{ display: "flex", fontSize: 82, fontWeight: 900, letterSpacing: -5, lineHeight: 1, marginTop: 30, textAlign: "center" }}>{content.name}</div>
      <div style={{ color: "#bdc2ce", display: "flex", fontSize: 30, marginTop: 30, maxWidth: 880, textAlign: "center" }}>{content.tagline}</div>
    </div>,
    { width: 1200, height: 630 },
  );
}
