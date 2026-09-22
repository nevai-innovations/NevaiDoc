"use client";

import { useRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useLightbox } from "@/components/providers";

export default function MarkdownView({ content }: { content: string }) {
  const ref = useRef<HTMLElement>(null);
  const openLightbox = useLightbox();

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
