"use client";

import { useState, type FormEvent } from "react";
import { Database, Save } from "lucide-react";
import { useSettings, useToast } from "@/components/providers";
import { btn, card, Field, input, PageLoading, Spinner } from "@/components/ui";
import { api, formatBytes, useFetch } from "@/lib/client";
import type { Settings } from "@/lib/types";

type Usage = { databaseBytes: number; documentBytes: number; attachmentBytes: number; attachmentCount: number };

/** Neon's free plan allows 0.5 GB per project. */
const FREE_PLAN_BYTES = 512 * 1024 * 1024;

export default function SettingsPage() {
  const { data, reload } = useFetch<{ settings: Settings; usage: Usage }>("/api/settings?usage=1");
  if (!data) return <PageLoading />;
  return <SettingsForm key={JSON.stringify(data.settings)} initial={data.settings} usage={data.usage} onSaved={reload} />;
}

function SettingsForm({ initial, usage, onSaved }: { initial: Settings; usage: Usage; onSaved: () => void }) {
  const toast = useToast();
  const { reload: reloadGlobal } = useSettings();
  const [workspaceName, setWorkspaceName] = useState(initial.workspaceName);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [busy, setBusy] = useState(false);
  const dirty = workspaceName !== initial.workspaceName || displayName !== initial.displayName;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/settings", { method: "PUT", body: { workspaceName, displayName } });
      toast("success", "Settings saved");
      reloadGlobal();
      onSaved();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Couldn't save settings");
      setBusy(false);
    }
  };

  const pct = Math.min(100, (usage.databaseBytes / FREE_PLAN_BYTES) * 100);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Settings</h1>
      <p className="mt-1 text-sm text-muted">Workspace preferences and storage.</p>

      <form onSubmit={submit} className={`${card} mt-6 divide-y divide-line`}>
        <div className="space-y-5 p-5 sm:p-6">
          <h2 className="text-base font-semibold text-slate-900">Workspace</h2>
          <Field label="Workspace name" hint="Shown in the header and on the dashboard.">
            <input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} className={input} maxLength={100} required />
          </Field>
          <Field
            label="Your name"
            hint="Used for the dashboard greeting, as the default owner of new documents, and recorded on versions and review actions."
          >
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={input} maxLength={100} placeholder="e.g. Arun" />
          </Field>
        </div>
        <div className="flex justify-end bg-slate-50/60 px-5 py-4 sm:rounded-b-xl sm:px-6">
          <button type="submit" className={btn.primary} disabled={busy || !dirty || !workspaceName.trim()}>
            {busy ? <Spinner /> : <Save className="h-4 w-4" />} Save changes
          </button>
        </div>
      </form>

      <section className={`${card} mt-6 p-5 sm:p-6`}>
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Database className="h-5 w-5 text-brand-600" /> Storage
        </h2>
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-slate-800">{formatBytes(usage.databaseBytes)} used</span>
            <span className="text-muted">of 512 MB on Neon&apos;s free plan</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div
              className={`h-full rounded-full ${pct > 85 ? "bg-red-500" : pct > 65 ? "bg-amber-500" : "bg-brand-600"}`}
              style={{ width: `${Math.max(pct, 1)}%` }}
            />
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <Stat label="Document text" value={formatBytes(usage.documentBytes)} />
          <Stat label="Images & diagrams" value={`${formatBytes(usage.attachmentBytes)} (${usage.attachmentCount})`} />
          <Stat label="Upload limit" value="4 MB per file" />
        </dl>
        <p className="mt-4 text-xs text-muted">
          Uploads are stored in the Postgres database. The total includes Postgres&apos;s own overhead and old row versions
          it hasn&apos;t cleaned up yet.
        </p>
      </section>

      <section className={`${card} mt-6 p-5 text-sm text-muted sm:p-6`}>
        <h2 className="text-base font-semibold text-slate-900">About</h2>
        <p className="mt-2">
          NevaiDoc — documentation portal for Nevai Innovations. This workspace has no sign-in: anyone with the link can
          view and edit documents.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800">{value}</dd>
    </div>
  );
}
