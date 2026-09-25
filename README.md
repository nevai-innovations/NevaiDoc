# NevaiDoc

The Nevai Innovations documentation portal: folders, Markdown documents,
architecture diagrams and images, version history and a review/approval
workflow. Built with Next.js and Postgres, designed to deploy to Vercel.

No login/accounts: anyone with the URL can view and edit. Set your name
under **Settings** so it's recorded on versions and review actions.

## Features

- **Dashboard**: document/folder/approval/attachment counts, recently
  updated documents, documents awaiting review, recent review activity.
- **Document Library**: nested folders, search across title, summary, content
  and tags, status filter, sorting, and moving documents between folders.
- **Document viewer/editor**: Markdown with live preview, a formatting
  toolbar, metadata (summary, folder, owner, tags) and sub-pages.
- **Files: PDF, Word, Excel, PowerPoint and more**: upload a file as a
  document of its own (Library → *Upload files*, or drag files onto the
  list), or attach it to any document (*Files & images* tab, or the editor's
  *File* button, paste or drop). Everything previews in the app:
  - PDF: the browser's built-in viewer
  - Excel (`.xlsx`, `.xls`) and CSV: a spreadsheet grid with sheet tabs
  - Word (`.docx`): converted to formatted text
  - PowerPoint (`.pptx`): a slide-by-slide text outline
  - Text, Markdown, JSON, YAML, logs; MP4/WebM video; MP3/WAV audio

  Older `.doc`/`.ppt` files can be uploaded and downloaded but not previewed.
  The server checks each file's actual contents against its extension.
- **Images & architecture diagrams**: upload from the editor (button, paste
  or drag-and-drop) or the *Files & images* tab. PNG, JPEG, GIF, WebP and
  SVG. Click any image for a full-screen lightbox with zoom, pan,
  next/previous and download.
- All uploads are limited to 4 MB per file (see Storage notes).
- **Version history**: every save of the title/content is a version. View
  any version, compare it with the current one, or restore it (restoring
  saves a new version and never rewrites history).
- **Reviews & Approvals**: Draft → Needs Review → Approved / Changes
  Requested, with reviewer, comments and an audit trail. Editing an approved
  document moves it back to Draft.
- **Templates**: start documents from templates, create your own, or use
  "Save as template" on any document.
- Every delete asks for confirmation in an in-app dialog.

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript + Tailwind CSS v4
- **Postgres** for storage, accessed directly with the `pg` driver (no ORM,
  so there's nothing extra to install or generate at build time)
- **react-markdown** (+ GFM, syntax highlighting) and **lucide-react** icons

## Project structure

```
src/app/                   Pages: / (dashboard), /library, /docs/[id],
                           /reviews, /templates, /settings
src/app/api/               REST API: pages (+ versions, review, attachments),
                           attachments, folders, templates, settings, dashboard
src/components/            App shell, sidebar, editor, lightbox, dialogs
src/components/doc/        Document page: attachments, versions, approvals
src/components/library/    Library view and folder tree
src/lib/                   db pool, data access (pages, folders, attachments,
                           templates, settings, dashboard), types, helpers
public/brand/              Official Nevai logo (used unmodified)
db/schema.sql              Postgres schema (additive and safe to re-run)
scripts/migrate.mjs        Applies db/schema.sql to DATABASE_URL
scripts/seed.mjs           Seeds templates (if none) and starter docs (if empty)
```

## Storage notes

Uploaded files and images are stored in Postgres (`attachments.data`, `bytea`), so no
extra storage service is needed. Each file is limited to 4 MB, because Vercel
rejects request bodies over 4.5 MB. On Neon's free plan (0.5 GB) this is
fine for a few hundred files. If you expect many large files, move
`attachments` to Vercel Blob or S3 later; the API already serves every image
through `/api/attachments/<id>`, so documents won't need editing.

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Point the app at a Postgres database. Copy `.env.example` to `.env` and
   fill in `DATABASE_URL`. For local development you can run Postgres
   yourself, or just use a free [Neon](https://neon.tech) database (same as
   you'll use in production — see below).

3. Create the table and add a couple of starter pages:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

4. Run the dev server:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000.

## Deploying to Vercel

### 1. Push this project to GitHub

Create a new (private, if you like) GitHub repo and push this folder to it:

```bash
git init
git add -A
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

### 2. Create a Postgres database

NevaiDoc needs a real Postgres database — Vercel's serverless functions don't
have a persistent local disk, so SQLite/local files won't work in
production. The easiest option:

- Go to [neon.tech](https://neon.tech), sign up (free tier is plenty for
  this), and create a new project/database.
- Copy the connection string it gives you (starts with `postgresql://` and
  ends with `?sslmode=require`).

(Vercel's own "Storage" tab also offers a Postgres option, which is backed
by Neon under the hood and gets wired into your project automatically if
you'd rather do it that way — either works.)

### 3. Import the project into Vercel

- Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repo
  you just pushed. It will auto-detect this as a Next.js project — no build
  settings need to change.
- Before the first deploy, open **Environment Variables** and add:
  - `DATABASE_URL` = the Neon connection string from step 2

- Click **Deploy**.

### 4. Create the database table

The app doesn't run migrations automatically on deploy (kept simple and
explicit on purpose). Do it once, from your own machine, pointed at the
same database Vercel is using:

```bash
# .env should contain the *same* DATABASE_URL you set in Vercel
npm run db:migrate
npm run db:seed   # optional — adds a couple of starter pages
```

That's it — reload your Vercel deployment URL and you should see the app.

### Updating later

Any time you push to `main`, Vercel redeploys automatically. If you ever
change `db/schema.sql`, re-run `npm run db:migrate` against the production
`DATABASE_URL` after pushing (it's written to be safe to run repeatedly).

## Notes / things you may want to add later

- **Auth**: this deploys wide open to anyone with the URL. The simplest
  options are Vercel's built-in
  [password protection](https://vercel.com/docs/deployment-protection) (paid
  plans) or a shared-password gate in `proxy.ts` (Next.js 16's replacement
  for `middleware.ts`). Per-user accounts would also let reviews be tied to
  real people instead of the "Your name" setting.
- **Search**: currently a simple `ILIKE` match, which is fine for thousands
  of documents. For ranking, switch to Postgres full-text search (`tsvector`).
