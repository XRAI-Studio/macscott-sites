import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

const frontmatterSchema = z.object({
  title: z.string().trim().min(1).max(120),
  date: z.union([z.string(), z.date()]).transform((value) => {
    const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.valueOf())) throw new Error("Invalid blog date");
    return date.toISOString().slice(0, 10);
  }),
  description: z.string().trim().min(1).max(240),
}).strict();

export type BlogPost = {
  slug: string;
  title: string;
  date: string;
  description: string;
  markdown: string;
};

async function markdownFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const full = path.join(current, entry.name);
    return entry.isDirectory() ? markdownFiles(root, full) : /\.md$/i.test(entry.name) ? [full] : [];
  }));
  return nested.flat();
}

export async function loadBlogPosts(root: string): Promise<BlogPost[]> {
  const files = await markdownFiles(root);
  const posts = await Promise.all(files.map(async (file) => {
    const source = await readFile(file, "utf8");
    const parsed = matter(source);
    const meta = frontmatterSchema.parse(parsed.data);
    return {
      slug: path.basename(file, path.extname(file)).toLowerCase(),
      ...meta,
      markdown: parsed.content,
    };
  }));
  const seen = new Set<string>();
  for (const post of posts) {
    if (seen.has(post.slug)) throw new Error(`Duplicate blog slug: ${post.slug}`);
    seen.add(post.slug);
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export async function renderMarkdown(markdown: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .process(markdown);
  return String(result);
}
