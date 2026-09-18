import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "International Energy Club | Global Exhibition Intelligence", template: "%s | International Energy Club" },
  description: "AI-powered global exhibition search, verification and intelligence for the energy industry.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
