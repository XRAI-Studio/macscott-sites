import { NextResponse } from "next/server";
import { hasValidBearer } from "@/lib/api-auth";
import { getCatalog, getCatalogRuntimeStatus } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!hasValidBearer(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const catalog = await getCatalog();
  return NextResponse.json({ catalog, runtime: getCatalogRuntimeStatus() });
}
