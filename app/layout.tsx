import type { Metadata, Viewport } from "next";
import { PwaRegistration } from "@/components/PwaRegistration";
import "./globals.css";

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
      <body>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
