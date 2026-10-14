import type { Metadata } from "next";
import Script from "next/script";
import { ClientReliability } from "@/components/ClientReliability";
import "flag-icons/css/flag-icons.min.css";
import "./globals.css";
import "./responsive.css";

export const metadata: Metadata = {
  title: { default: "International Energy Club | Global Exhibition Intelligence", template: "%s | International Energy Club" },
  description: "AI-powered global exhibition search, verification and intelligence for the energy industry.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-theme="dark" suppressHydrationWarning><head><Script src="/theme-init.js" strategy="beforeInteractive" /></head><body><ClientReliability />{children}</body></html>;
}
