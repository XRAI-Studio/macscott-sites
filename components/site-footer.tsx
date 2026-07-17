import type { TenantContent } from "@/content/tenants/types";

export function SiteFooter({ content }: { content: TenantContent }) {
  return (
    <footer className="site-footer">
      <div className="footer-links">
        {content.socials.map((social) => <a className={social.placeholder ? "placeholder" : undefined} href={social.href} key={social.label} rel="noreferrer" target="_blank">{social.label}</a>)}
      </div>
      <p>© {new Date().getUTCFullYear()} {content.name} · Visit <a href={content.otherSite}>{content.otherName}’s world ↗</a></p>
    </footer>
  );
}
