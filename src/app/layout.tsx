import type { Metadata } from "next";
import "./globals.css";

const metadataBaseUrl =
  typeof process.env.NEXTAUTH_URL === "string" && process.env.NEXTAUTH_URL.startsWith("http")
    ? process.env.NEXTAUTH_URL
    : "https://gbitportal.co.kr";

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl),
  title: "지비아이티 임직원 전용 사이트",
  description: "지비아이티 포털 — 휴가·결재·제주 숙소·근태를 한 곳에서 관리합니다.",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
  openGraph: {
    title: "지비아이티 임직원 전용 사이트",
    description: "지비아이티 포털 — 휴가·결재·제주 숙소·근태를 한 곳에서 관리합니다.",
    siteName: "GBIT Portal",
    locale: "ko_KR",
    type: "website",
    images: [{ url: "/gbit-og-v2.png", width: 1024, height: 571, type: "image/png", alt: "GBIT Portal" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "지비아이티 임직원 전용 사이트",
    description: "지비아이티 포털 — 휴가·결재·제주 숙소·근태",
    images: ["/gbit-og-v2.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
