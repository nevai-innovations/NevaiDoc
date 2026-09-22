import { randomUUID } from "crypto";
import { query, queryOne } from "@/lib/db";
import type { Template } from "@/lib/types";

type Row = {
  id: string;
  name: string;
  description: string;
  category: string;
  content: string;
  created_at: Date;
  updated_at: Date;
};

function toTemplate(r: Row): Template {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    content: r.content,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

type TemplateInput = { name: string; description?: string; category?: string; content?: string };

function clean(input: TemplateInput) {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("NAME_REQUIRED");
  return {
    name,
    description: (input.description ?? "").trim().slice(0, 500),
    category: (input.category ?? "").trim().slice(0, 60) || "General",
    content: input.content ?? "",
  };
}

export async function listTemplates(): Promise<Template[]> {
  const rows = await query<Row>("SELECT * FROM templates ORDER BY category, name");
  return rows.map(toTemplate);
}

export async function getTemplate(id: string): Promise<Template | null> {
  const row = await queryOne<Row>("SELECT * FROM templates WHERE id = $1", [id]);
  return row ? toTemplate(row) : null;
}

export async function createTemplate(input: TemplateInput): Promise<Template> {
  const t = clean(input);
  const row = await queryOne<Row>(
    `INSERT INTO templates (id, name, description, category, content)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [randomUUID(), t.name, t.description, t.category, t.content]
  );
  return toTemplate(row!);
}

export async function updateTemplate(id: string, input: TemplateInput): Promise<Template> {
  const t = clean(input);
  const row = await queryOne<Row>(
    `UPDATE templates SET name = $1, description = $2, category = $3, content = $4, updated_at = now()
     WHERE id = $5 RETURNING *`,
    [t.name, t.description, t.category, t.content, id]
  );
  if (!row) throw new Error("NOT_FOUND");
  return toTemplate(row);
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const rows = await query("DELETE FROM templates WHERE id = $1 RETURNING id", [id]);
  return rows.length > 0;
}
