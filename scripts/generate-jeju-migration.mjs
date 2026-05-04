/**
 * 제주 숙소 이관 데이터 초안 엑셀 생성 스크립트
 * 실행: node scripts/generate-jeju-migration.mjs
 * 출력: scripts/jeju_migration_draft.xlsx
 */
import * as XLSX from "xlsx";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── 외부개발자 월별 출현 데이터 (이미지 OCR 기반, 날짜는 사용자 확인 필요) ──────────────
// 날짜 형식: YYYY-MM-DD, 빈칸은 직접 기입 필요
const externalData = [
  // 2026-02
  { month: "2026-02", name: "최구영", startDate: "", endDate: "" },

  // 2026-03
  { month: "2026-03", name: "최구영", startDate: "", endDate: "" },
  { month: "2026-03", name: "백승주", startDate: "", endDate: "" },

  // 2026-04
  { month: "2026-04", name: "최구영", startDate: "", endDate: "" },
  { month: "2026-04", name: "백승주", startDate: "", endDate: "" },
  { month: "2026-04", name: "김가남", startDate: "", endDate: "" },

  // 2026-05
  { month: "2026-05", name: "최구영", startDate: "", endDate: "" },
  { month: "2026-05", name: "백승주", startDate: "", endDate: "" },
  { month: "2026-05", name: "김가남", startDate: "", endDate: "" },
  { month: "2026-05", name: "박대용", startDate: "", endDate: "" },
  { month: "2026-05", name: "김은수", startDate: "", endDate: "" },

  // 2026-06
  { month: "2026-06", name: "최구영", startDate: "", endDate: "" },
  { month: "2026-06", name: "백승주", startDate: "", endDate: "" },
  { month: "2026-06", name: "김가남", startDate: "", endDate: "" },
  { month: "2026-06", name: "박대용", startDate: "", endDate: "" },
  { month: "2026-06", name: "김정임", startDate: "", endDate: "" },

  // 2026-07
  { month: "2026-07", name: "김애자", startDate: "", endDate: "" },
  { month: "2026-07", name: "김민은", startDate: "", endDate: "" },
];

// ─── 임포트 양식 헤더 ──────────────────────────────────────────────────────────
const headers = [
  "신청자명",
  "신청자사번(선택)",
  "입실일(YYYY-MM-DD)",
  "퇴실일(YYYY-MM-DD)",
  "투숙객명",
  "투숙객연락처",
  "입실인원",
  "입금자명",
  "메모(선택)",
];

const rows = externalData.map((d) => [
  d.name,            // 신청자명
  "",                // 신청자사번 (외부개발자는 미등록이므로 빈칸)
  d.startDate,       // 입실일 — 직접 기입
  d.endDate,         // 퇴실일 — 직접 기입
  d.name,            // 투숙객명 (본인으로 정규화)
  "",                // 투숙객연락처 — 직접 기입
  1,                 // 입실인원 (기본 1, 수정 가능)
  d.name,            // 입금자명 (본인으로 정규화)
  `이관처리 ${d.month}`,  // 메모
]);

const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

// 열 너비
ws["!cols"] = [
  { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
  { wch: 10 }, { wch: 16 }, { wch: 8 }, { wch: 10 }, { wch: 18 },
];

// 헤더 행 스타일 (노란 배경 안내)
const headerNote = "※ 입실일·퇴실일·투숙객연락처를 확인 후 기입하세요. 날짜는 YYYY-MM-DD 형식.";
ws["J1"] = { t: "s", v: headerNote };

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "외부개발자이관");

// ─── 참고: 유니크 이름 시트 ────────────────────────────────────────────────────
const uniqueNames = [...new Set(externalData.map((d) => d.name))];
const ws2 = XLSX.utils.aoa_to_sheet([
  ["이름", "등장월"],
  ...uniqueNames.map((name) => [
    name,
    externalData.filter((d) => d.name === name).map((d) => d.month).join(", "),
  ]),
]);
ws2["!cols"] = [{ wch: 12 }, { wch: 40 }];
XLSX.utils.book_append_sheet(wb, ws2, "외부개발자목록");

const outPath = join(__dirname, "jeju_migration_draft.xlsx");
const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
writeFileSync(outPath, buf);
console.log("✅ 생성 완료:", outPath);
console.log(`   총 ${rows.length}행 (외부개발자 ${uniqueNames.length}명)`);
console.log("\n외부개발자 목록:");
uniqueNames.forEach((n) => {
  const months = externalData.filter((d) => d.name === n).map((d) => d.month);
  console.log(`  - ${n}: ${months.join(", ")}`);
});
