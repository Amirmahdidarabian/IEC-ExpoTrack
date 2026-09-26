import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "International Energy Club | Global Exhibition Intelligence", template: "%s | International Energy Club" },
  description: "AI-powered global exhibition search, verification and intelligence for the energy industry.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-theme="dark" suppressHydrationWarning><head><Script src="/theme-init.js" strategy="beforeInteractive" /></head><body>{children}</body></html>;
}
