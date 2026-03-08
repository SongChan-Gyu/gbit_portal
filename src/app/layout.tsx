import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GBIT Portal",
  description: "지비아이티 포털",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
