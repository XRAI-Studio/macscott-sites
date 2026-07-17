import type { Tenant } from "@/lib/tenant";

export type Social = { label: string; href: string; placeholder?: boolean };

export type TenantContent = {
  id: Tenant;
  name: string;
  shortName: string;
  agent: string;
  account: string;
  tagline: string;
  eyebrow: string;
  about: string;
  passions: string;
  future: string;
  hire: string;
  discord: string;
  otherSite: string;
  otherName: string;
  colors: { primary: string; secondary: string; glow: string; rgb: string };
  socials: Social[];
};
