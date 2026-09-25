"use client";

import { Children, isValidElement, useRef, type ReactNode } from "react";
import { Eye } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { FileIcon, fileLabel } from "@/components/files/FileIcon";
import { useFilePreview, useLightbox } from "@/components/providers";

const ATTACHMENT_URL = /^\/api\/attachments\/[0-9a-f-]+$/i;

function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : isValidElement<{ children?: ReactNode }>(c) ? textOf(c.props.children) : ""))
    .join("");
}

export default function MarkdownView({ content }: { content: string }) {
  const ref = useRef<HTMLElement>(null);
  const openLightbox = useLightbox();
  const previewFile = useFilePreview();

  const openAt = (src: string) => {
    const imgs = [...(ref.current?.querySelectorAll<HTMLImageElement>("img[data-zoomable]") ?? [])];
    const images = imgs.map((img) => ({
      src: img.getAttribute("src") ?? "",
      alt: img.alt,
      caption: img.title || img.alt,
    }));
    openLightbox(
      images,
      Math.max(
        images.findIndex((i) => i.src === src),
        0
      )
    );
  };

  const components: Components = {
    img: ({ src, alt, title }) => {
      if (typeof src !== "string" || !src) return null;
      return (
        <button
          type="button"
          onClick={() => openAt(src)}
          className="group relative inline-block cursor-zoom-in align-top"
          aria-label={`Open image${alt ? `: ${alt}` : ""}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt ?? ""} title={title} data-zoomable loading="lazy" className="my-0" />
        </button>
      );
    },
    a: ({ href, children }) => {
      // Uploaded files (PDF, Excel, Word, …) render as a card that opens the in-app preview.
      if (href && ATTACHMENT_URL.test(href)) {
        const filename = textOf(children).trim() || "File";
        return (
          <span className="not-prose my-1 inline-flex max-w-full items-center gap-3 rounded-xl border border-line bg-white py-2 pl-2 pr-2 align-middle shadow-sm">
            <FileIcon filename={filename} className="h-9 w-9" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-900">{filename}</span>
              <span className="block text-xs text-muted">{fileLabel(filename)}</span>
            </span>
            <button
              type="button"
              onClick={() => previewFile({ url: href, filename })}
              className="ml-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </button>
            <a
              href={`${href}?download=1`}
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              download={filename}
            >
              Download
            </a>
          </span>
        );
      }
      const external = !!href && /^https?:\/\//.test(href);
      return (
        <a href={href} {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
          {children}
        </a>
      );
    },
  };

  return (
    <article
      ref={ref}
      className="nv-prose prose prose-slate max-w-none prose-headings:scroll-mt-24 prose-a:text-brand-700 prose-pre:bg-slate-50 prose-pre:text-slate-800 prose-code:before:content-none prose-code:after:content-none prose-img:my-4"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
        {content}
      </ReactMarkdown>
    </article>
  );
}
