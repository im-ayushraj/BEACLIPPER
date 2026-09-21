import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { AppClerkProvider } from "@/components/AuthComponents";
import { PageLoader } from "@/components/PageLoader";

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
  const gaMeasurementId =
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-1KHVMPBYPT";

  return (
    <html lang="en" className="dark scroll-smooth">
      <head>
        {gaMeasurementId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaMeasurementId}', {
                  page_path: window.location.pathname,
                });
              `}
            </Script>
          </>
        )}
      </head>
      <body className="min-h-screen bg-[#090a0f] text-white flex flex-col antialiased">
        <AppClerkProvider>
          <PageLoader />
          {children}
        </AppClerkProvider>
      </body>
    </html>
  );
}
