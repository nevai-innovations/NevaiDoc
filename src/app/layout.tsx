import type { Metadata } from "next";
import "./globals.css";
import "highlight.js/styles/github.css";

export const metadata: Metadata = {
  title: "NevaiDoc",
  description: "A simple self-hosted documentation wiki",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full h-full flex flex-col bg-white text-zinc-900 font-sans">
        {children}
      </body>
    </html>
  );
}
