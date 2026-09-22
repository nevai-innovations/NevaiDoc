"use client";

import { Suspense, use } from "react";
import DocumentPage from "@/components/doc/DocumentPage";
import { PageLoading } from "@/components/ui";

export default function DocPage({ params }: PageProps<"/docs/[id]">) {
  const { id } = use(params);
  return (
    <Suspense fallback={<PageLoading label="Loading document…" />}>
      <DocumentPage key={id} id={id} />
    </Suspense>
  );
}
