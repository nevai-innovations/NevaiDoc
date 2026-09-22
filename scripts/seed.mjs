// Seeds a starter set of pages so a fresh install isn't a blank slate.
// Skips seeding if any pages already exist.
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

function slugify(input) {
  return (
    input
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "page"
  );
}

const pages = [
  {
    title: "Welcome",
    content: `# Welcome to NevaiDoc

This is your new documentation space. It works a lot like Confluence or a
wiki:

- Pages live in a tree in the sidebar — nest them as deep as you like.
- Everything is written in **Markdown**, with tables, code blocks, and
  checklists supported.
- Click **Edit** on any page to change it, **+** to add a sub-page, and
  **×** to delete one.

Use the sidebar to explore the example pages, or click **+ New** to start
writing your own.
`,
  },
  {
    title: "Getting Started",
    content: `# Getting Started

1. Click **+ New** in the sidebar to create a page.
2. Give it a title and hit **Edit** to write content in Markdown.
3. Hover a page in the sidebar and click **+** to nest a sub-page under it —
   great for grouping docs by team, project, or topic.
4. Click **Save** when you're done.
`,
    children: [
      {
        title: "Markdown Cheatsheet",
        content: `# Markdown Cheatsheet

## Headings
\`# H1\`, \`## H2\`, \`### H3\`

## Emphasis
**bold**, *italic*, ~~strikethrough~~

## Lists
- item one
- item two
  - nested item

## Code

\`\`\`js
function hello() {
  console.log("hello, docs!");
}
\`\`\`

## Tables

| Feature | Supported |
| ------- | --------- |
| Tables  | ✅        |
| Code    | ✅        |
| Images  | ✅        |

## Links & images

[Markdown Guide](https://www.markdownguide.org)
`,
      },
    ],
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  const pool = new Pool({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });

  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM pages");
  if (rows[0].count > 0) {
    console.log("Pages already exist — skipping seed.");
    await pool.end();
    return;
  }

  async function insert(node, parentId, order) {
    const id = randomUUID();
    const slug = slugify(node.title);
    await pool.query(
      `INSERT INTO pages (id, title, slug, content, "order", parent_id) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, node.title, slug, node.content ?? "", order, parentId]
    );
    if (node.children) {
      let i = 0;
      for (const child of node.children) {
        await insert(child, id, i++);
      }
    }
  }

  let i = 0;
  for (const page of pages) {
    await insert(page, null, i++);
  }

  console.log(`Seeded ${pages.length} top-level page(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
