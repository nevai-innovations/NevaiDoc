// Seeds starter content so a fresh install isn't a blank slate.
// - Templates are added if there are no templates yet.
// - Folders and pages are added only if there are no pages yet.
// Safe to run repeatedly; it never modifies existing content.
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

const templates = [
  {
    name: "Architecture Overview",
    category: "Engineering",
    description: "System context, components, data flow and key decisions — with a slot for your architecture diagram.",
    content: `# Architecture Overview

## Context
What problem does this system solve, and who uses it?

## Architecture diagram
> Upload your diagram from the **Diagrams** panel (or the editor's *Diagram* button) and it will appear here.

## Components
| Component | Responsibility | Owner |
| --------- | -------------- | ----- |
|           |                |       |

## Data flow
1. …

## Key decisions
- …

## Risks & open questions
- …
`,
  },
  {
    name: "Architecture Decision Record",
    category: "Engineering",
    description: "Capture one significant technical decision, its context and consequences.",
    content: `# ADR: <decision title>

**Status:** Proposed
**Date:** <yyyy-mm-dd>

## Context
What is the issue that motivates this decision?

## Decision
What is the change that we're proposing or have agreed to?

## Options considered
1. **Option A** — pros / cons
2. **Option B** — pros / cons

## Consequences
What becomes easier or harder because of this change?
`,
  },
  {
    name: "Product Requirements",
    category: "Product",
    description: "Problem, goals, user stories and success metrics for a feature.",
    content: `# <Feature> — Product Requirements

## Problem
## Goals
- [ ] …

## Non-goals
## User stories
- As a …, I want …, so that …

## Requirements
| # | Requirement | Priority |
| - | ----------- | -------- |
| 1 |             | Must     |

## Success metrics
## Open questions
`,
  },
  {
    name: "Runbook",
    category: "Operations",
    description: "Step-by-step operational procedure with alerts, diagnosis and rollback.",
    content: `# Runbook: <service / alert>

## When to use this
## Impact
## Diagnosis
\`\`\`bash
# commands to check health
\`\`\`

## Resolution steps
1. …

## Rollback
## Escalation
| Level | Contact |
| ----- | ------- |
| L1    |         |
`,
  },
  {
    name: "Meeting Notes",
    category: "General",
    description: "Agenda, discussion, decisions and action items.",
    content: `# Meeting: <topic>

**Date:** <yyyy-mm-dd> · **Attendees:** …

## Agenda
1. …

## Notes
## Decisions
## Action items
- [ ] <owner> — <task> — <due>
`,
  },
  {
    name: "API Reference",
    category: "Engineering",
    description: "Endpoint, parameters, example request/response and errors.",
    content: `# <API name>

## \`GET /resource/{id}\`
Short description.

### Parameters
| Name | In | Type | Required | Description |
| ---- | -- | ---- | -------- | ----------- |
| id   | path | string | yes | |

### Example response
\`\`\`json
{
  "id": "123"
}
\`\`\`

### Errors
| Status | Meaning |
| ------ | ------- |
| 404    | Not found |
`,
  },
];

const folders = [{ name: "Getting Started" }, { name: "Engineering", children: [{ name: "Architecture" }] }, { name: "Product" }];

const pages = [
  {
    title: "Welcome",
    folder: "Getting Started",
    description: "What this workspace is and how to find your way around.",
    tags: ["onboarding"],
    content: `# Welcome to NevaiDoc

This is your documentation portal.

- **Document Library** — browse folders and documents, or search everything.
- **Documents** are written in **Markdown**, with tables, code blocks,
  checklists, images and architecture diagrams.
- Every save is kept in **version history**, so you can compare and restore.
- Send a document for **review** and track its approval status.
- Start new documents quickly from **Templates**.
`,
  },
  {
    title: "Getting Started",
    folder: "Getting Started",
    description: "Create, edit, review and organise documents.",
    tags: ["onboarding", "how-to"],
    content: `# Getting Started

1. Click **New document** (or pick a template) to create a document.
2. Click **Edit** to write in Markdown — the preview updates as you type.
3. Use **Image** / **Diagram** in the editor toolbar (or paste / drop an image)
   to upload pictures. Click any image to open it full-screen.
4. Click **Save**. Each save becomes a new version under **History**.
5. When it's ready, **Submit for review**. A reviewer can **Approve** or
   **Request changes**.
`,
    children: [
      {
        title: "Markdown Cheatsheet",
        description: "Quick reference for Markdown syntax.",
        tags: ["reference"],
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

  const { rows: templateRows } = await pool.query("SELECT COUNT(*)::int AS count FROM templates");
  if (templateRows[0].count > 0) {
    console.log("Templates already exist — skipping templates.");
  } else {
    for (const t of templates) {
      await pool.query(
        `INSERT INTO templates (id, name, description, category, content) VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), t.name, t.description, t.category, t.content]
      );
    }
    console.log(`Seeded ${templates.length} template(s).`);
  }

  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM pages");
  if (rows[0].count > 0) {
    console.log("Pages already exist — skipping pages.");
    await pool.end();
    return;
  }

  const folderIds = new Map();
  async function insertFolder(node, parentId) {
    const id = randomUUID();
    folderIds.set(node.name, id);
    await pool.query(`INSERT INTO folders (id, name, parent_id) VALUES ($1, $2, $3)`, [id, node.name, parentId]);
    for (const child of node.children ?? []) await insertFolder(child, id);
  }
  for (const f of folders) await insertFolder(f, null);

  async function insert(node, parentId, folderId, order) {
    const id = randomUUID();
    const slug = slugify(node.title);
    const ownFolder = node.folder ? folderIds.get(node.folder) : folderId;
    await pool.query(
      `INSERT INTO pages (id, title, slug, content, "order", parent_id, folder_id, description, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, node.title, slug, node.content ?? "", order, parentId, ownFolder ?? null, node.description ?? "", node.tags ?? []]
    );
    await pool.query(
      `INSERT INTO page_versions (id, page_id, version, title, content, note) VALUES ($1, $2, 1, $3, $4, 'Created')`,
      [randomUUID(), id, node.title, node.content ?? ""]
    );
    if (node.children) {
      let i = 0;
      for (const child of node.children) {
        await insert(child, id, ownFolder, i++);
      }
    }
  }

  let i = 0;
  for (const page of pages) {
    await insert(page, null, null, i++);
  }

  console.log(`Seeded ${folderIds.size} folder(s) and ${pages.length} top-level page(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
