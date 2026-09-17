import type { Metadata } from "next";
import "./globals.css";
import { AppClerkProvider } from "@/components/AuthComponents";

export const metadata: Metadata = {
  title: "Clipper — Turn Long Videos Into Engaging Shorts Automatically",
  description:
    "AI-powered video clipping SaaS. Extract high-retention 30–60s video shorts with titles, viral scores, and timestamps.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className="min-h-screen bg-[#090a0f] text-white flex flex-col antialiased">
        <AppClerkProvider>{children}</AppClerkProvider>
      </body>
    </html>
  );
}
