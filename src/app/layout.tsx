import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RetireWise — AI-Powered Retirement Investment Modeling",
  description:
    "Track, analyze, and model your retirement investments with AI-powered insights and recommendations.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RetireWise",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

/**
 * The app declares `black-translucent` for standalone iOS, which puts the
 * status bar over the page, so the viewport has to cover the whole screen and
 * the layout has to respect the insets itself. Without `viewport-fit=cover`
 * the two settings disagree and content sits in a dead band under the notch.
 *
 * No `maximumScale` or `userScalable`: pinch-zoom is how someone with poor
 * eyesight reads a number on a phone, and iOS auto-zoom is already avoided by
 * keeping form controls at 16px.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
