export function appSlug(account: string, repo: string): string {
  return `${account}--${repo}`.toLowerCase();
}
