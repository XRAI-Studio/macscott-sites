import { timingSafeEqual } from "node:crypto";

export function hasValidBearer(request: Request): boolean {
  const secret = process.env.REVALIDATE_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
