"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Maximize, X, ZoomIn, ZoomOut } from "lucide-react";

export type LightboxImage = { src: string; alt?: string; caption?: string; filename?: string };

const ZOOM_STEPS = [1, 1.5, 2, 3, 4];

/**
 * Full-screen image / diagram viewer. Zoom 1 = "fit to screen"; higher
 * levels scale relative to that and the image can be dragged to pan.
 * Keys: Esc close · ←/→ previous/next · +/- zoom · 0 fit.
 */
export function Lightbox({
  images,
  initialIndex,
  onClose,
}: {
  images: LightboxImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const image = images[index];
  const many = images.length > 1;

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => (i + delta + images.length) % images.length);
      setZoom(1);
      setFitWidth(null);
      setFailed(false);
    },
    [images.length]
  );

  const zoomBy = useCallback((dir: 1 | -1) => {
    setZoom((z) => {
      const i = ZOOM_STEPS.indexOf(z);
      return ZOOM_STEPS[Math.min(Math.max(i + dir, 0), ZOOM_STEPS.length - 1)];
    });
  }, []);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowRight" && many) go(1);
      else if (e.key === "ArrowLeft" && many) go(-1);
      else if (e.key === "+" || e.key === "=") zoomBy(1);
      else if (e.key === "-") zoomBy(-1);
      else if (e.key === "0") setZoom(1);
    };
    document.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [go, many, onClose, zoomBy]);

  // Remember the fitted width so zoom levels are relative to "fit".
  const measureFit = () => {
    if (zoom === 1 && imgRef.current) setFitWidth(imgRef.current.getBoundingClientRect().width);
  };

  // Keep the zoom centred on the middle of the image.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || zoom === 1) return;
    stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2;
    stage.scrollTop = (stage.scrollHeight - stage.clientHeight) / 2;
  }, [zoom]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom === 1 || !stageRef.current) return;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      left: stageRef.current.scrollLeft,
      top: stageRef.current.scrollTop,
      moved: false,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !stageRef.current) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    stageRef.current.scrollLeft = d.left - dx;
    stageRef.current.scrollTop = d.top - dy;
  };
  const onPointerUp = () => {
    setTimeout(() => (drag.current = null), 0);
  };

  const onImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (drag.current?.moved) return;
    setZoom((z) => (z === 1 ? 2 : 1));
  };

  const downloadHref = image.src.startsWith("/api/attachments/") ? `${image.src}?download=1` : image.src;
  const label = image.caption || image.alt || image.filename || "Image";

  const toolBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white disabled:opacity-30";

  return createPortal(
    <div
      className="nv-fade-in fixed inset-0 z-[70] flex flex-col bg-navy-950"
      role="dialog"
      aria-modal="true"
      aria-label={`Image viewer: ${label}`}
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-white sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{label}</p>
          {many && (
            <p className="text-xs text-white/60">
              {index + 1} of {images.length}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button className={toolBtn} onClick={() => zoomBy(-1)} disabled={zoom === 1} aria-label="Zoom out" title="Zoom out (-)">
            <ZoomOut className="h-5 w-5" />
          </button>
          <span className="hidden w-12 text-center text-xs tabular-nums text-white/70 sm:inline">
            {zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`}
          </span>
          <button
            className={toolBtn}
            onClick={() => zoomBy(1)}
            disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
            aria-label="Zoom in"
            title="Zoom in (+)"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <button className={toolBtn} onClick={() => setZoom(1)} disabled={zoom === 1} aria-label="Fit to screen" title="Fit (0)">
            <Maximize className="h-5 w-5" />
          </button>
          <a className={toolBtn} href={image.src} target="_blank" rel="noreferrer" aria-label="Open original" title="Open original">
            <ExternalLink className="h-5 w-5" />
          </a>
          <a className={toolBtn} href={downloadHref} download={image.filename || true} aria-label="Download" title="Download">
            <Download className="h-5 w-5" />
          </a>
          <button ref={closeRef} className={toolBtn} onClick={onClose} aria-label="Close" title="Close (Esc)">
            <X className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={stageRef}
          className={`nv-scroll absolute inset-0 ${
            zoom === 1 ? "flex items-center justify-center overflow-hidden p-4 sm:p-10" : "overflow-auto"
          }`}
          onClick={() => {
            // Releasing a pan over the backdrop shouldn't close the viewer.
            if (!drag.current?.moved) onClose();
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {failed ? (
            <p className="text-sm text-white/70" onClick={(e) => e.stopPropagation()}>
              This image couldn&apos;t be loaded.
            </p>
          ) : zoom === 1 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              key={image.src}
              src={image.src}
              alt={image.alt ?? ""}
              onLoad={measureFit}
              onError={() => setFailed(true)}
              onClick={onImageClick}
              className="max-h-full max-w-full cursor-zoom-in select-none rounded-md bg-white object-contain shadow-2xl"
              draggable={false}
            />
          ) : (
            <div className="flex min-h-full min-w-full items-center justify-center p-4 sm:p-10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.src}
                alt={image.alt ?? ""}
                onClick={onImageClick}
                style={{ width: fitWidth ? fitWidth * zoom : `${zoom * 60}vw` }}
                className="max-w-none cursor-grab select-none rounded-md bg-white shadow-2xl active:cursor-grabbing"
                draggable={false}
              />
            </div>
          )}
        </div>

        {many && (
          <>
            <button
              onClick={() => go(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 sm:left-4"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={() => go(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 sm:right-4"
              aria-label="Next image"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
