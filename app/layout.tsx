import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Simba AI",
    template: "%s · Simba AI",
  },
  description:
    "Your AI marketing team — research, content, ads, and ops in one workspace.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://www.lowcostbeach.co.uk",
  ),
  openGraph: {
    title: "Simba AI",
    description:
      "Your AI marketing team — research, content, ads, and ops in one workspace.",
    type: "website",
    siteName: "Simba AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "Simba AI",
    description:
      "Your AI marketing team — research, content, ads, and ops in one workspace.",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
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
        className={`${inter.variable} ${poppins.variable} min-h-screen font-sans antialiased`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
