import type { Metadata, Viewport } from "next";
import { Sarabun } from "next/font/google";
import { PwaRegistration } from "@/components/PwaRegistration";
import "./globals.css";

const sarabun = Sarabun({
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin", "thai"],
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "PharmaCheck",
  description: "แบบตรวจ GPP สำหรับ iPad ที่ทำงานแบบออฟไลน์",
  applicationName: "PharmaCheck",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PharmaCheck",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d6657",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className={sarabun.className}>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
