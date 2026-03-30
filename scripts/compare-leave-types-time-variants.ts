/**
 * LeaveType 시간대 통합 가능성 검사용
 *
 * 목표:
 * - applyGroupKey 기반으로 "시간대가 다른 타입" (오전/오후/종일)을 묶고
 * - non-slot 메타가 동일한지 비교합니다.
 *
 * 출력:
 * - 그룹별로 non-slot 필드가 전부 동일하면 OK
 * - 하나라도 다르면 DIFF 필드와 코드 목록을 표시
 *
 * 실행:
 *   npx tsx scripts/compare-leave-types-time-variants.ts
 */

import { PrismaClient } from "@prisma/client";
import { APPLY_GROUP_BY_CODE } from "../src/lib/leaveApplyGroups";

const prisma = new PrismaClient();

type LeaveTypeForCompare = {
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  color: string;

  // "시간대 메타"(통합 대상에서 제외)
  isHalf: boolean;
  isAmOnly: boolean;
  isPmOnly: boolean;
  allowsFullDay: boolean;
  allowsHalfDay: boolean;
  halfDayAmPm: string;
  daysPerUnit: number;

  // "non-slot 메타"(통합 안전성 비교용)
  deductFromBalance: boolean;
  approvalSteps: number;
  requiresStamp: boolean;
  stampCount: number | null;
  allocationSourceCode: string | null;
  applyGroupKey: string | null;
  validityBasis: string;
  validityMonths: number | null;
  maxPerMonth: number | null;
  maxPerYear: number | null;
};

type NonSlotSignature = Omit<
  LeaveTypeForCompare,
  | "code"
  | "name"
  | "isActive"
  | "sortOrder"
  | "color"
  | "isHalf"
  | "isAmOnly"
  | "isPmOnly"
  | "allowsFullDay"
  | "allowsHalfDay"
  | "halfDayAmPm"
  | "daysPerUnit"
>;

const TIME_VARIANT_GROUPS = new Set(["annual", "public", "recognition", "care", "holidayExt", "birthday"]);

function groupKeyOf(t: Pick<LeaveTypeForCompare, "applyGroupKey" | "code">): string {
  if (t.applyGroupKey && TIME_VARIANT_GROUPS.has(t.applyGroupKey)) return t.applyGroupKey;
  const mapped = APPLY_GROUP_BY_CODE[t.code];
  return mapped && TIME_VARIANT_GROUPS.has(mapped) ? mapped : "unknown";
}

function nonSlotSignature(t: LeaveTypeForCompare): NonSlotSignature {
  return {
    deductFromBalance: t.deductFromBalance,
    approvalSteps: t.approvalSteps,
    requiresStamp: t.requiresStamp,
    stampCount: t.stampCount,
    allocationSourceCode: t.allocationSourceCode,
    applyGroupKey: t.applyGroupKey,
    validityBasis: t.validityBasis,
    validityMonths: t.validityMonths,
    maxPerMonth: t.maxPerMonth,
    maxPerYear: t.maxPerYear,
  };
}

function signatureToKey(s: NonSlotSignature): string {
  // 안정적인 비교를 위해 문자열화
  return JSON.stringify(s);
}

function formatSlotMeta(t: LeaveTypeForCompare) {
  const slot = t.isHalf ? (t.isAmOnly ? "AM" : t.isPmOnly ? "PM" : "HALF(BOTH?)") : "FULL";
  const halfHint =
    t.allowsFullDay && t.allowsHalfDay ? "dual" : t.allowsHalfDay && !t.allowsFullDay ? `half:${t.halfDayAmPm}` : "full-only";
  return `${t.code} [${slot}](${halfHint}) dpU=${t.daysPerUnit}`;
}

async function main() {
  const rows = await prisma.leaveType.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
      sortOrder: true,
      color: true,
      isHalf: true,
      isAmOnly: true,
      isPmOnly: true,
      allowsFullDay: true,
      allowsHalfDay: true,
      halfDayAmPm: true,
      daysPerUnit: true,
      deductFromBalance: true,
      approvalSteps: true,
      requiresStamp: true,
      stampCount: true,
      allocationSourceCode: true,
      applyGroupKey: true,
      validityBasis: true,
      validityMonths: true,
      maxPerMonth: true,
      maxPerYear: true,
    },
  });

  const typedRows = rows as unknown as LeaveTypeForCompare[];

  const grouped: Record<string, LeaveTypeForCompare[]> = {};
  for (const t of typedRows) {
    const gk = groupKeyOf(t);
    if (!grouped[gk]) grouped[gk] = [];
    grouped[gk].push(t);
  }

  const targets = Array.from(TIME_VARIANT_GROUPS);

  console.log("== 시간대 통합 비교 (non-slot 메타 동일성) ==");
  console.log(`비교 대상 그룹: ${targets.join(", ")}`);
  console.log("");

  let anyDiff = false;

  for (const gk of targets) {
    const list = grouped[gk] ?? [];
    console.log(`-- 그룹: ${gk} (active types=${list.length})`);
    if (list.length <= 1) {
      console.log(`OK: ${list.length}개라 비교 불필요`);
      console.log("");
      continue;
    }

    const sig0 = nonSlotSignature(list[0]);
    const key0 = signatureToKey(sig0);
    const diffs: Array<{ t: LeaveTypeForCompare; sigKey: string }> = [];

    for (const t of list) {
      const k = signatureToKey(nonSlotSignature(t));
      if (k !== key0) diffs.push({ t, sigKey: k });
    }

    if (diffs.length === 0) {
      console.log("OK: non-slot 메타가 모두 동일합니다.");
      console.log(
        "  타입:",
        list
          .map((t) => formatSlotMeta(t))
          .join(" | "),
      );
      console.log("");
      continue;
    }

    anyDiff = true;
    console.log("DIFF: non-slot 메타가 동일하지 않습니다. (시간대 외 규정 차이)");
    console.log(
      "  기준:",
      list[0].code,
    );
    console.log(
      "  다른 타입:",
      diffs.map((d) => formatSlotMeta(d.t)).join(" | "),
    );

    // 어떤 필드가 다른지 뽑기
    const base = nonSlotSignature(list[0]);
    for (const t of diffs.map((d) => d.t)) {
      const cur = nonSlotSignature(t);
      const diffFields: string[] = [];
      for (const k of Object.keys(base) as Array<keyof NonSlotSignature>) {
        if (base[k] !== cur[k]) diffFields.push(String(k));
      }
      console.log(`  ${t.code} differs in: ${diffFields.join(", ") || "(unknown)"}`);
    }
    console.log("");
  }

  // unknown 출력 (매핑/필드 누락 가능성)
  const unknownList = grouped["unknown"] ?? [];
  if (unknownList.length > 0) {
    console.log(`-- unknown(매핑 실패 or 대상 아님): ${unknownList.length}`);
    console.log(unknownList.map((t) => t.code).join(", "));
    console.log("");
  }

  if (anyDiff) {
    console.log("결론: 시간대 통합이 자동으로 안전하다고 보기 어렵습니다. (non-slot 차이 존재)");
    process.exit(1);
  }

  console.log("결론: 해당 그룹은 '시간대 메타만 차이'이고 non-slot은 동일합니다.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

