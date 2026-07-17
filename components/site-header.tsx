import Link from "next/link";
import type { TenantContent } from "@/content/tenants/types";

export function SiteHeader({ content }: { content: TenantContent }) {
  return (
    <header className="site-header">
      <Link className="wordmark" href="/" aria-label={`${content.name} home`}><span>◉</span> {content.name.toUpperCase()}</Link>
      <nav className="site-nav" aria-label="Primary navigation">
        <Link href="/apps">APPS</Link><Link href="/blog">BLOG</Link><Link href="/social">SOCIAL</Link>
      </nav>
    </header>
  );
}
