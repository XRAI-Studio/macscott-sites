import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadBlogPosts, renderMarkdown } from "@/lib/blog";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function tempBlog() {
  const root = await mkdtemp(path.join(tmpdir(), "macscott-blog-"));
  roots.push(root);
  return root;
}

describe("blog", () => {
  it("loads and validates frontmatter", async () => {
    const root = await tempBlog();
    await writeFile(path.join(root, "welcome.md"), "---\ntitle: Welcome\ndate: 2026-07-17\ndescription: First post\n---\nHello");
    const posts = await loadBlogPosts(root);
    expect(posts[0]).toMatchObject({ slug: "welcome", title: "Welcome", date: "2026-07-17" });
  });

  it("rejects malformed frontmatter", async () => {
    const root = await tempBlog();
    await writeFile(path.join(root, "bad.md"), "---\ntitle: Missing fields\n---\nNope");
    await expect(loadBlogPosts(root)).rejects.toThrow();
  });

  it("rejects duplicate case-insensitive slugs", async () => {
    const root = await tempBlog();
    const post = "---\ntitle: Post\ndate: 2026-07-17\ndescription: Desc\n---\nBody";
    await mkdir(path.join(root, "one"));
    await mkdir(path.join(root, "two"));
    await writeFile(path.join(root, "one", "Hello.md"), post);
    await writeFile(path.join(root, "two", "hello.md"), post);
    await expect(loadBlogPosts(root)).rejects.toThrow(/duplicate/i);
  });

  it("strips raw HTML and unsafe link schemes", async () => {
    const html = await renderMarkdown("<script>alert(1)</script>\n\n[bad](javascript:alert(1)) [good](https://example.com)");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("https://example.com");
  });
});
