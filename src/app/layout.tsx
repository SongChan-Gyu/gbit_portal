import type { Metadata } from "next";
import "./globals.css";

const metadataBaseUrl =
  typeof process.env.NEXTAUTH_URL === "string" && process.env.NEXTAUTH_URL.startsWith("http")
    ? process.env.NEXTAUTH_URL
    : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl),
  title: "GBIT Portal",
  description: "지비아이티 포털 — 휴가·결재·제주 숙소·근태를 한 곳에서 관리합니다.",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
  openGraph: {
    title: "GBIT Portal",
    description: "지비아이티 포털 — 휴가·결재·제주 숙소·근태를 한 곳에서 관리합니다.",
    siteName: "GBIT Portal",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GBIT Portal",
    description: "지비아이티 포털 — 휴가·결재·제주 숙소·근태",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
