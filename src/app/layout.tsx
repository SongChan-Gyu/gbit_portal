import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HRM 시스템",
  description: "인사관리 시스템",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
