import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "GBIT Portal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** 카카오 등 링크 미리보기용 — 한글 폰트 이슈 피하려고 이미지 문구는 ASCII 위주 */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1e3a8a 0%, #312e81 100%)",
          padding: 72,
        }}
      >
        <div style={{ fontSize: 72, fontWeight: 800, color: "white", letterSpacing: -2 }}>GBIT Portal</div>
        <div style={{ fontSize: 28, color: "rgba(255,255,255,0.88)", marginTop: 20, fontWeight: 600 }}>
          gbitportal.co.kr
        </div>
        <div style={{ fontSize: 22, color: "rgba(255,255,255,0.75)", marginTop: 12 }}>
          Leave · Approvals · Jeju stay · Attendance
        </div>
      </div>
    ),
    { ...size },
  );
}
