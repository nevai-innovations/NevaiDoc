"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { Lightbox, type LightboxImage } from "@/components/Lightbox";
import { btn, Modal } from "@/components/ui";
import { useFetch } from "@/lib/client";
import type { Settings } from "@/lib/types";
import type { PreviewFile } from "@/components/files/FilePreview";

// Loaded on first use: the viewers pull in the spreadsheet/Word/PowerPoint parsers.
const FilePreviewModal = dynamic(() => import("@/components/files/FilePreview").then((m) => m.FilePreviewModal), {
  ssr: false,
});

// ---------- Settings (workspace name, display name) ----------

const DEFAULTS: Settings = { workspaceName: "Nevai Workspace", displayName: "" };

const SettingsContext = createContext<{ settings: Settings; loaded: boolean; reload: () => void }>({
  settings: DEFAULTS,
  loaded: false,
  reload: () => {},
});

export function useSettings() {
  return useContext(SettingsContext);
}

function SettingsProvider({ children }: { children: ReactNode }) {
  const { data, reload } = useFetch<{ settings: Settings }>("/api/settings");
  const value = useMemo(
    () => ({ settings: data?.settings ?? DEFAULTS, loaded: !!data, reload }),
    [data, reload]
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

// ---------- Confirmation dialog ----------

export type ConfirmOptions = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
};

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

/** `if (await confirm({...})) { ... }` — an in-app replacement for window.confirm. */
export function useConfirm() {
  return useContext(ConfirmContext);
}

function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    resolver.current?.(false);
    setOptions(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  }, []);

  const tone = options?.tone ?? "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!options}
        onClose={() => settle(false)}
        size="sm"
        title={
          <span className="flex items-center gap-3">
            {tone === "danger" && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </span>
            )}
            {options?.title}
          </span>
        }
        footer={
          <>
            <button className={btn.secondary} onClick={() => settle(false)} data-autofocus>
              {options?.cancelLabel ?? "Cancel"}
            </button>
            <button className={tone === "danger" ? btn.danger : btn.primary} onClick={() => settle(true)}>
              {options?.confirmLabel ?? (tone === "danger" ? "Delete" : "Confirm")}
            </button>
          </>
        }
      >
        <div className="text-sm leading-relaxed text-slate-600">{options?.message}</div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

// ---------- Toasts ----------

type Toast = { id: number; kind: "success" | "error" | "info"; message: string };

const ToastContext = createContext<(kind: Toast["kind"], message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: Toast["kind"], message: string) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3500);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="nv-pop-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm shadow-lg"
            role={t.kind === "error" ? "alert" : "status"}
          >
            {t.kind === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : t.kind === "error" ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            )}
            <span className="flex-1 text-slate-700">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-700" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------- Image lightbox ----------

const LightboxContext = createContext<(images: LightboxImage[], index?: number) => void>(() => {});

export function useLightbox() {
  return useContext(LightboxContext);
}

function LightboxProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ images: LightboxImage[]; index: number } | null>(null);
  const open = useCallback((images: LightboxImage[], index = 0) => {
    if (images.length) setState({ images, index: Math.min(Math.max(index, 0), images.length - 1) });
  }, []);
  return (
    <LightboxContext.Provider value={open}>
      {children}
      {state && (
        <Lightbox
          // Remount per opening so zoom state starts fresh.
          key={state.images.map((i) => i.src).join("|")}
          images={state.images}
          initialIndex={state.index}
          onClose={() => setState(null)}
        />
      )}
    </LightboxContext.Provider>
  );
}

// ---------- File preview (PDF, Excel, Word, …) ----------

const FilePreviewContext = createContext<(file: PreviewFile) => void>(() => {});

export function useFilePreview() {
  return useContext(FilePreviewContext);
}

function FilePreviewProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<PreviewFile | null>(null);
  const close = useCallback(() => setFile(null), []);
  return (
    <FilePreviewContext.Provider value={setFile}>
      {children}
      {file && <FilePreviewModal key={file.url} file={file} onClose={close} />}
    </FilePreviewContext.Provider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <ToastProvider>
        <ConfirmProvider>
          <LightboxProvider>
            <FilePreviewProvider>{children}</FilePreviewProvider>
          </LightboxProvider>
        </ConfirmProvider>
      </ToastProvider>
    </SettingsProvider>
  );
}
