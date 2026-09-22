import { Suspense } from "react";
import type { Metadata } from "next";
import LibraryView from "@/components/library/LibraryView";
import { PageLoading } from "@/components/ui";

export const metadata: Metadata = { title: "Document Library" };

export default function LibraryPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <LibraryView />
    </Suspense>
  );
}
