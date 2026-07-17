import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { hasValidBearer } from "@/lib/api-auth";

export async function POST(request: Request) {
  if (!hasValidBearer(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  revalidateTag("catalog", "max");
  revalidatePath("/t/scott", "layout");
  revalidatePath("/t/alexander", "layout");
  console.info(JSON.stringify({ event: "catalog.revalidate", at: new Date().toISOString() }));
  return NextResponse.json({ revalidated: true });
}

export function GET() { return NextResponse.json({ error: "Method not allowed" }, { status: 405 }); }
