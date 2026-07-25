import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  metadataBase: new URL("https://orkestria-ai.sites.openai.com"),
  title: {
    default: "OrkestriaAI — Intelligence that gets work done",
    template: "%s | OrkestriaAI",
  },
  description:
    "The trusted AI operations control plane for browser agents, workflows, DevOps, cloud cost, and security.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "OrkestriaAI — Intelligence that gets work done",
    description:
      "One secure control plane for AI agents that browse, automate, operate, optimize, and protect your business.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1731,
        height: 909,
        alt: "OrkestriaAI — Intelligence that gets work done",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OrkestriaAI — Intelligence that gets work done",
    description:
      "One secure control plane for AI agents that browse, automate, operate, optimize, and protect your business.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
