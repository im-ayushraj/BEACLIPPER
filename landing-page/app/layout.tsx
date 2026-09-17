import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clipper — Turn Long Videos Into Short-Form Content Automatically",
  description:
    "Automatically find the most important moments in your videos, turn them into short clips, or split videos into fixed durations — all from one simple workspace.",
  openGraph: {
    title: "Clipper — Turn Long Videos Into Short-Form Content Automatically",
    description:
      "Find top moments with AI clipping or split videos into fixed durations with FFmpeg. Join the pre-launch waitlist.",
    url: "https://clipper.so",
    siteName: "Clipper",
    images: [
      {
        url: "https://clipper.so/og-preview.png",
        width: 1200,
        height: 630,
        alt: "Clipper AI Video Studio Preview",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clipper — AI Video Clipper & Video Splitter",
    description: "Turn long videos into short-form content in seconds.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gaMeasurementId =
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-1KHVMPBYPT";
  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;

  return (
    <html lang="en" className="dark scroll-smooth">
      <head>
        {/* Google Analytics 4 (Conditional) */}
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

        {/* Meta Pixel (Conditional) */}
        {metaPixelId && (
          <Script id="meta-pixel-init" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${metaPixelId}');
              fbq('track', 'PageView');
            `}
          </Script>
        )}
      </head>
      <body className="min-h-screen bg-[#090a0f] text-white flex flex-col antialiased selection:bg-blue-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
