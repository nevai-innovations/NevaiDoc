# NevaiDoc

A small, self-hosted documentation wiki — nested pages, a sidebar tree, and
Markdown editing, similar in spirit to Confluence. Built with Next.js and
Postgres, designed to deploy to Vercel for free.

No login/accounts — it's meant for a single person or a team that's fine
sharing one open space. (If you need per-user accounts later, that's a
follow-up project.)

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS
- **Postgres** for storage, accessed directly with the `pg` driver (no ORM,
  so there's nothing extra to install or generate at build time)
- **react-markdown** for rendering page content

## Project structure

```
src/app/                 Next.js App Router pages
src/app/api/pages/       REST API for pages (list/create/get/update/delete)
src/components/          Sidebar (page tree) and PageEditor (view/edit)
src/lib/                 db connection, page queries, slug helper, types
db/schema.sql            Postgres schema (one `pages` table)
scripts/migrate.mjs      Applies db/schema.sql to DATABASE_URL
scripts/seed.mjs         Seeds a few starter pages (only if the DB is empty)
```

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

- **Search** — not included in this first version. A simple option later is
  Postgres full-text search (`tsvector`) over `title`/`content`.
- **Version history** — not included. Would mean adding a `page_revisions`
  table and writing a row to it on every save.
- **Auth** — this deploys wide open to anyone with the URL. If you want to
  restrict access, the simplest options are Vercel's built-in
  [password protection](https://vercel.com/docs/deployment-protection) (paid
  plans) or adding a shared-password gate in `middleware.ts`.
