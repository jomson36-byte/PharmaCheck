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
    icon: "/app-icon.svg",
    apple: "/app-icon.svg",
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
