import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getFiscalYear } from "@/lib/workdays";
import { fiscalPeriod } from "@/lib/leaveCalc";
import { formatMDWithDay, formatYMD } from "@/lib/dateUtils";
import { getTenureScheduleForFiscalYears } from "@/lib/scheduler";
import CancelButton from "./CancelButton";
import CancelRequestButton from "./CancelRequestButton";
import MyLeaveMonthlyTable from "./MyLeaveMonthlyTable";
import { redirect } from "next/navigation";
import { mergedLeaveTypeLabel } from "@/lib/leaveDisplay";
import { summarizeLeaveApprovals } from "@/lib/leaveApprovalDisplay";
import { leaveRequestStatusMeta } from "@/lib/statusMeta";
import MyLeaveRequestFooter from "./MyLeaveRequestFooter";
import { isAnnualPoolSourceCode } from "@/lib/annualPoolSource";

export default async function MyLeavePage({ searchParams }: { searchParams: Promise<{ fy?: string; tab?:string }> }) {
  const session = await auth();
  const user    = session!.user as any;
  const self = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { employeeType: true },
  });
  if (self?.employeeType === "EXTERNAL") redirect("/dashboard");
  const { fy: fyRaw, tab } = await searchParams;
  const fy       = fyRaw ? parseInt(fyRaw) : getFiscalYear();
  const activeTab = tab ?? "list"; // list | monthly

  const { start: fyStart, end: fyEnd } = fiscalPeriod(fy);
  const fyRangeLabel = `${formatYMD(fyStart)} ~ ${formatYMD(fyEnd)}`;

  const [allocations, requests, tenureScheduleAll, reasonNoPoolLeaveTypes, assetPoolLeaveTypes, tenureMilestoneCodes] = await Promise.all([
    // 관리자 휴가관리와 동일: 태그된 귀속연도(fiscalYear)이거나, 선택 FY 구간과 유효기간이 겹치면 표시
    prisma.leaveAllocation.findMany({
      where: {
        employeeId: user.employeeId,
        isActive: true,
        OR: [
          { fiscalYear: fy },
          { AND: [{ validFrom: { lte: fyEnd } }, { validUntil: { gte: fyStart } }] },
        ],
      },
      orderBy: [{ fiscalYear:"desc" }, { sourceCode:"asc" }],
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: user.employeeId,
        startDate: { lte: fyEnd },
        endDate:   { gte: fyStart },
      },
      include: {
        items: { include: { leaveType: true } },
        approvals: { include: { approver: true }, orderBy: { step:"asc" } },
      },
      orderBy: { startDate:"desc" },
    }),
    getTenureScheduleForFiscalYears(fy),
    prisma.leaveType.findMany({
      where: {
        isActive: true,
        usageCategory: "REASON",
        allocationSourceCode: null,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.leaveType.findMany({
      where: {
        isActive: true,
        usageCategory: "ASSET",
        allocationSourceCode: { not: null },
      },
      select: { allocationSourceCode: true },
    }),
    // 근속 마일스톤 sourceCode 목록 (tenureYears != null인 AllocationSourceConfig)
    prisma.allocationSourceConfig.findMany({
      where: { isActive: true, tenureYears: { not: null } },
      select: { sourceCode: true },
    }).then((cfgs) => new Set(cfgs.map((c) => c.sourceCode))),
  ]);

  // 이번·다음 귀속연도 중 본인 근속휴가 부여 예정 (언제부터 쓸 수 있는지 보여주기 위함)
  const myTenureSchedule = tenureScheduleAll.filter((r) => r.employeeId === user.employeeId);
  const tenureThisFy = myTenureSchedule.filter((r) => r.fiscalYear === fy);
  const tenureNextFy = myTenureSchedule.filter((r) => r.fiscalYear === fy + 1);

  // 같은 귀속연도에 근속휴가가 fiscalYear null + fy 두 개 있으면 하나만 표시 (init 중복 방지)
  // tenureMilestoneCodes: AllocationSourceConfig.tenureYears != null 기반으로 동적 로드
  const TENURE_CODES = tenureMilestoneCodes;
  const rawFyAllocs = allocations;
  const byTenureSource = new Map<string, (typeof rawFyAllocs)[0]>();
  const fyAllocs: (typeof rawFyAllocs)[0][] = [];
  const annualPoolRows = rawFyAllocs.filter((a) => isAnnualPoolSourceCode(a.sourceCode));
  const baseDays = annualPoolRows
    .filter((a) => a.sourceCode === "BASE_ANNUAL" || a.sourceCode.startsWith("MONTHLY_ACCRUAL_") || a.sourceCode === "ANNUAL")
    .reduce((s, a) => s + a.totalDays, 0);
  const tenureDays = annualPoolRows.find((a) => a.sourceCode === "TENURE_BONUS")?.totalDays ?? 0;
  const carryDays = annualPoolRows.find((a) => a.sourceCode === "CARRYOVER")?.totalDays ?? 0;
  const annualBreakdownLabel = `연차 (기본 ${baseDays} · 근속 ${tenureDays} · 이월 ${carryDays})`;
  const annualMerged = annualPoolRows.length > 0 ? [{
    id: "annual-merged",
    label: annualBreakdownLabel,
    totalDays: annualPoolRows.reduce((s, a) => s + a.totalDays, 0),
    usedDays: annualPoolRows.reduce((s, a) => s + a.usedDays, 0),
    validFrom: annualPoolRows.reduce((min, a) => new Date(a.validFrom) < new Date(min) ? a.validFrom : min, annualPoolRows[0].validFrom),
    validUntil: annualPoolRows.reduce((max, a) => new Date(a.validUntil) > new Date(max) ? a.validUntil : max, annualPoolRows[0].validUntil),
    note: null as string | null,
    sourceCode: "ANNUAL",
    employeeId: "",
    fiscalYear: fy,
  }] as (typeof rawFyAllocs)[0][] : [];
  for (const a of rawFyAllocs) {
    if (TENURE_CODES.has(a.sourceCode)) {
      const cur = byTenureSource.get(a.sourceCode);
      if (!cur || (a.fiscalYear === fy && cur.fiscalYear !== fy)) byTenureSource.set(a.sourceCode, a);
    } else if (!isAnnualPoolSourceCode(a.sourceCode)) {
      fyAllocs.push(a);
    }
  }
  fyAllocs.push(...annualMerged);
  byTenureSource.forEach((a) => fyAllocs.push(a));

  // 총 부여/사용/잔여: 자산형 메타(usageCategory=ASSET) 기반 + 정책성 필수 소스 fallback
  const kpiAssetSourceCodes = new Set(
    assetPoolLeaveTypes
      .map((lt) => lt.allocationSourceCode)
      .filter((v): v is string => !!v),
  );
  // 정책상 자산형으로 유지해야 하는 공통 풀(LeaveType과 직접 1:1이 아닐 수 있음)
  const KPI_ASSET_FALLBACK = new Set(["ANNUAL", "DUTY_DEPT"]);
  // 선택 귀속 구간과 유효기간이 겹치는 부여만 상단 KPI에 반영(오늘 기준만 쓰면 FY 시작 전·말 후 탭에서 0으로 보이던 문제 방지)
  const allocsOverlappingFy = fyAllocs.filter(
    (a) => new Date(a.validFrom) <= fyEnd && new Date(a.validUntil) >= fyStart,
  );
  const kpiAllocs = allocsOverlappingFy.filter(
    (a) => kpiAssetSourceCodes.has(a.sourceCode) || KPI_ASSET_FALLBACK.has(a.sourceCode) || isAnnualPoolSourceCode(a.sourceCode),
  );
  const granted  = kpiAllocs.reduce((s,a)=>s+a.totalDays, 0);
  const used     = kpiAllocs.reduce((s,a)=>s+a.usedDays,  0);
  const remain   = granted - used;

  // 월별 사용 집계 (귀속연도 인덱스 기준)
  const MONTH_LABELS = ["5월","6월","7월","8월","9월","10월","11월","12월","1월","2월","3월","4월"];
  const monthlyUsage = Array<number>(12).fill(0);
  for (const req of requests.filter((r) => r.status === "APPROVED")) {
    for (const item of req.items) {
      const s  = new Date(item.startDate);
      const m  = s.getMonth() + 1;
      const mi = m >= 5 ? m - 5 : m + 7;
      monthlyUsage[mi] += item.days;
    }
  }

  /** 부여 풀(LeaveAllocation) 없이 쓰는 유형 — 승인된 신청만으로 사용 일수 집계 */
  const approvedInFy = requests.filter((r) => r.status === "APPROVED");
  const reasonNoPoolUsage = reasonNoPoolLeaveTypes.map((t) => {
    let used = 0;
    for (const r of approvedInFy) {
      for (const it of r.items) {
        if (it.leaveTypeId === t.id) used += it.days;
      }
    }
    return { id: t.id, name: t.name, code: t.code, color: t.color, used };
  });
  const reasonNoPoolHasAny = reasonNoPoolUsage.some((r) => r.used > 0);

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="page-title">내 휴가 현황</h1>
        <p className="page-subtitle">{fy}년도 ({fyRangeLabel})</p>
        <p className="text-xs text-gray-500 mt-1.5 max-w-xl leading-relaxed">
          신청 내역은 <strong>선택한 귀속연도</strong>와 휴가 일정이 겹치는 건만 보입니다. 지금 탭 범위:{" "}
          <span className="text-gray-600 font-medium">{fyRangeLabel}</span>.
          안 보이면 상단에서 이전·다음 귀속연도를 눌러 보세요.
          「월별」은 <strong>승인 완료</strong>된 휴만 집계합니다. 결재 중이면 「목록」을 보세요.
        </p>
      </div>

      {/* 귀속연도 탭 */}
      <div className="flex gap-1.5">
        {[fy-1, fy, fy+1].map((y) => (
          <a key={y} href={`?fy=${y}&tab=${activeTab}`}
            className={`btn-sm ${y === fy ? "btn-primary" : "btn-secondary"}`}>
            {y}년
          </a>
        ))}
      </div>

      {/* 요약 카드 (자산형 부여만 합산) */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-3 gap-3">
          <div className="stat-card">
            <div className="stat-num">{granted.toFixed(0)}</div>
            <div className="stat-label">총 부여</div>
          </div>
          <div className="stat-card">
            <div className="stat-num text-red-600">{used.toFixed(1)}</div>
            <div className="stat-label">사용</div>
          </div>
          <div className="stat-card">
            <div className="stat-num text-blue-700">{remain.toFixed(1)}</div>
            <div className="stat-label">잔여</div>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 px-0.5">
          연차·돌봄·이벤트 등 소모 자산만 집계합니다. 공가·병가·인정 등은 아래 「사유형 사용」에서 승인 일수를 확인하세요.
        </p>
      </div>

      {/* 유형별 잔여 */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">유형별 잔여 상세</span>
        </div>
        {/* 모바일: 카드 */}
        <div className="md:hidden divide-y divide-gray-100">
          {fyAllocs.length === 0 && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">해당 연도 할당 없음</div>
          )}
          {fyAllocs.map((a) => {
            const rem = a.totalDays - a.usedDays;
            const isExp = new Date(a.validUntil) < new Date();
            return (
              <div key={a.id} className={`px-4 py-3 ${isExp ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-gray-800">{a.label}</p>
                  {isExp && <span className="badge badge-danger">만료</span>}
                </div>
                {a.note && <p className="text-xs text-gray-400 mt-0.5">{a.note}</p>}
                <div className="flex justify-between items-baseline mt-1.5 text-sm">
                  <span className="text-gray-500">부여 {a.totalDays} · 사용 <span className="text-red-600">{a.usedDays}</span></span>
                  <span className="font-bold text-blue-700">잔여 {rem.toFixed(1)}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{formatYMD(a.validFrom)} ~ {formatYMD(a.validUntil)}</p>
              </div>
            );
          })}
        </div>
        {/* PC: 테이블 */}
        <div className="hidden md:block table-scroll">
        <table className="data-table allocation-table">
          <thead>
            <tr><th>구분</th><th>부여</th><th>사용</th><th>잔여</th><th>유효기간</th></tr>
          </thead>
          <tbody>
            {fyAllocs.length === 0 && (
              <tr><td colSpan={5} className="text-center py-6 text-gray-400">해당 연도 할당 없음</td></tr>
            )}
            {fyAllocs.map((a) => {
              const rem   = a.totalDays - a.usedDays;
              const isExp = new Date(a.validUntil) < new Date();
              return (
                <tr key={a.id} className={isExp ? "opacity-50" : ""}>
                  <td>
                    <p className="font-medium text-gray-800">{a.label}</p>
                    {a.note && <p className="text-xs text-gray-400">{a.note}</p>}
                    {isExp && <span className="badge badge-danger">만료</span>}
                  </td>
                  <td className="text-right font-medium">{a.totalDays}</td>
                  <td className="text-right text-red-600">{a.usedDays}</td>
                  <td className="text-right font-bold text-blue-700">{rem.toFixed(1)}</td>
                  <td className="text-xs text-gray-500 whitespace-nowrap">
                    {formatYMD(a.validFrom)} ~ {formatYMD(a.validUntil)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* 사유형: 승인 일수만 별도 집계 (공가·병가·인정·경조 등) */}
      {reasonNoPoolLeaveTypes.length > 0 && (
        <div className="panel">
          <div className="panel-header flex-wrap gap-1">
            <span className="panel-title">사유형 사용 (승인 집계)</span>
            <span className="text-xs text-gray-500 font-normal">
              별도 잔여 풀과 무관하게, 승인된 사용 일수만 합산해서 보여줍니다.
            </span>
          </div>
          {!reasonNoPoolHasAny ? (
            <div className="panel-body text-center py-6 text-gray-400 text-sm">
              이 귀속연도에 해당 유형 승인 사용이 없습니다.
            </div>
          ) : (
            <>
              <div className="md:hidden divide-y divide-gray-100">
                {reasonNoPoolUsage
                  .filter((r) => r.used > 0)
                  .map((r) => (
                    <div key={r.id} className="px-4 py-3">
                      <p className="font-medium text-gray-800" style={{ color: r.code === "SICK" ? "#dc2626" : r.color }}>
                        {r.name}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        부여 <span className="text-gray-400">0</span>
                        {" · "}
                        사용 <span className="text-red-600 font-semibold tabular-nums">{r.used.toFixed(1)}</span>일
                      </p>
                    </div>
                  ))}
              </div>
              <div className="hidden md:block table-scroll px-0">
                <table className="data-table allocation-table">
                  <thead>
                    <tr>
                      <th>구분</th>
                      <th className="text-right">부여</th>
                      <th className="text-right">사용(승인)</th>
                      <th>비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reasonNoPoolUsage
                      .filter((row) => row.used > 0)
                      .map((r) => (
                        <tr key={r.id}>
                          <td>
                            <span
                              className="font-medium"
                              style={{ color: r.code === "SICK" ? "#dc2626" : r.color }}
                            >
                              {r.name}
                            </span>
                          </td>
                          <td className="text-right text-gray-400">0</td>
                          <td className="text-right font-semibold text-red-600 tabular-nums">{r.used.toFixed(1)}</td>
                          <td className="text-xs text-gray-500">부여 풀 없음</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* 이번 귀속연도 중 근속휴가 부여 예정 */}
      {(tenureThisFy.length > 0 || tenureNextFy.length > 0) && (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">근속휴가 부여 예정</span>
          </div>
          <div className="panel-body space-y-4">
            {tenureThisFy.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">
                  {fy}년도 ({fy}.05.01 ~ {fy + 1}.04.30)
                </p>
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">부여예정일</th>
                      <th className="px-3 py-2 text-left font-semibold">구분</th>
                      <th className="px-3 py-2 text-center font-semibold">일수</th>
                      <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tenureThisFy.map((r, i) => (
                      <tr key={`${r.grantDate}-${r.code}-${i}`} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2 text-gray-800">{formatYMD(r.grantDate)}</td>
                        <td className="px-3 py-2 font-medium text-gray-800">{r.label}</td>
                        <td className="px-3 py-2 text-center">{r.days}일</td>
                        <td className="px-3 py-2 text-center">
                          {r.alreadyGranted ? (
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">부여됨</span>
                          ) : (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">예정</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tenureNextFy.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">
                  다음 귀속연도 ({fy + 1}.05.01 ~ {fy + 2}.04.30)
                </p>
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">부여예정일</th>
                      <th className="px-3 py-2 text-left font-semibold">구분</th>
                      <th className="px-3 py-2 text-center font-semibold">일수</th>
                      <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tenureNextFy.map((r, i) => (
                      <tr key={`${r.grantDate}-${r.code}-${i}`} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2 text-gray-800">{formatYMD(r.grantDate)}</td>
                        <td className="px-3 py-2 font-medium text-gray-800">{r.label}</td>
                        <td className="px-3 py-2 text-center">{r.days}일</td>
                        <td className="px-3 py-2 text-center">
                          {r.alreadyGranted ? (
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">부여됨</span>
                          ) : (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">예정</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 신청 내역 – 간결 목록 + 상세는 펼치기 */}
      <div className="panel">
        <div className="panel-header flex-wrap gap-2">
          <span className="panel-title">신청 내역</span>
          <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
            <a href={`?fy=${fy}&tab=list`}
              className={`px-3 py-2 ${activeTab==="list"?"bg-slate-600 text-white":"bg-white text-gray-600 hover:bg-gray-50"}`}>
              목록
            </a>
            <a href={`?fy=${fy}&tab=monthly`}
              className={`px-3 py-2 ${activeTab==="monthly"?"bg-slate-600 text-white":"bg-white text-gray-600 hover:bg-gray-50"}`}>
              월별
            </a>
          </div>
        </div>

        {activeTab === "monthly" ? (
          <MyLeaveMonthlyTable
            monthlyUsage={monthlyUsage}
            monthLabels={MONTH_LABELS}
            requests={requests.filter((r) => r.status==="APPROVED").map((r) => ({
              id: r.id,
              startDate: r.startDate.toISOString(),
              endDate:   r.endDate.toISOString(),
              totalDays: r.totalDays,
              items: r.items.map((i) => ({
                leaveTypeName:  i.leaveType.name,
                leaveTypeColor: i.leaveType.color,
                leaveTypeApplyGroupKey: i.leaveType.applyGroupKey ?? null,
                timeSlot: i.timeSlot ?? null,
                isHalf: i.leaveType.isHalf,
                isAmOnly: i.leaveType.isAmOnly,
                isPmOnly: i.leaveType.isPmOnly,
                allowsFullDay: (i.leaveType as any).allowsFullDay ?? null,
                allowsHalfDay: (i.leaveType as any).allowsHalfDay ?? null,
                halfDayAmPm: (i.leaveType as any).halfDayAmPm ?? null,
                days: i.days,
                startDate: i.startDate.toISOString(),
                endDate:   i.endDate.toISOString(),
              })),
            }))}
            fy={fy}
          />
        ) : requests.length === 0 ? (
          <div className="panel-body text-center py-10 text-gray-400 space-y-2">
            <p>신청 내역이 없습니다.</p>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              선택한 귀속연도({fy}년)와 휴가 날짜가 겹치지 않으면 표시되지 않습니다. 상단 연도 버튼을 바꿔 보세요.
            </p>
          </div>
        ) : (
          <ul className="p-3 space-y-3 md:p-0 md:space-y-0 md:divide-y md:divide-gray-100">
            {requests.map((req) => (
              <li key={req.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm md:rounded-none md:border-0 md:shadow-none md:px-3 md:py-2.5 md:hover:bg-gray-50/50">
                <div className="p-3 md:p-0">
                  <div className="flex justify-between items-start gap-3 mb-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium leading-snug">
                        {req.items.length === 1 ? (
                          (() => {
                            const it0 = req.items[0]!;
                            const { mergedName, mergedColor } = mergedLeaveTypeLabel(it0.leaveType as any, {
                              timeSlot: it0.timeSlot ?? null,
                            });
                            const c = mergedColor ?? it0.leaveType.color ?? "#111827";
                            return (
                              <span className="font-semibold" style={{ color: c }}>
                                {mergedName}
                              </span>
                            );
                          })()
                        ) : (
                          <span className="text-gray-900">{`복합 신청 (${req.items.length}건)`}</span>
                        )}
                      </p>
                      <p className="text-sm text-gray-600">
                        {formatMDWithDay(req.startDate)}
                        {req.startDate.toDateString() !== req.endDate.toDateString() && ` ~ ${formatMDWithDay(req.endDate)}`}
                        <span className="text-slate-800 font-semibold ml-1 tabular-nums">· {req.totalDays}일</span>
                      </p>
                    </div>
                    {(() => {
                      const st = leaveRequestStatusMeta(req.status);
                      return <span className={`badge shrink-0 whitespace-nowrap ${st.badge}`}>{st.label}</span>;
                    })()}
                  </div>
                </div>
                {(() => {
                  const isCompound = req.items.length > 1;
                  const hasItemReason = req.items.some((it) => it.reason?.trim() && it.reason.trim().length >= 2);
                  const showDetail =
                    isCompound || req.approvals.length > 0 || hasItemReason;
                  const detailBlock = (
                    <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
                      {isCompound && (
                        <div>
                          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            포함 휴가 ({req.items.length}건)
                          </p>
                          <ul className="space-y-2 rounded-lg border border-gray-100 bg-slate-50/60 p-2.5">
                            {req.items.map((it) => (
                              <li key={it.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs sm:text-sm">
                                {(() => {
                                  const { mergedName, mergedColor } = mergedLeaveTypeLabel(it.leaveType as any, {
                                    timeSlot: it.timeSlot ?? null,
                                  });
                                  return (
                                    <span
                                      className="font-semibold shrink-0"
                                      style={{ color: mergedColor ?? it.leaveType.color }}
                                    >
                                      {mergedName}
                                    </span>
                                  );
                                })()}
                                <span className="text-gray-500">
                                  {formatMDWithDay(it.startDate)}
                                  {it.startDate.toDateString() !== it.endDate.toDateString() &&
                                    ` ~ ${formatMDWithDay(it.endDate)}`}
                                </span>
                                <span className="text-slate-700 tabular-nums font-semibold">{it.days}일</span>
                                {it.reason?.trim() && it.reason.trim().length >= 2 && (
                                  <span className="text-gray-400 w-full text-[11px]">사유: {it.reason.trim()}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {req.approvals.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                            결재
                          </p>
                          <p className="text-xs text-gray-700 leading-snug">
                            {summarizeLeaveApprovals(req.approvals)}
                          </p>
                        </div>
                      )}
                      {!isCompound && hasItemReason && (
                        <p className="text-xs">
                          <span className="text-gray-400">사유</span> {req.items[0]?.reason?.trim()}
                        </p>
                      )}
                      {isCompound && hasItemReason && (
                        <p className="text-[11px] text-gray-400">사유는 위 각 휴가 줄에 표시되어 있습니다.</p>
                      )}
                    </div>
                  );
                  return (
                    <MyLeaveRequestFooter
                      requestId={req.id}
                      status={req.status}
                      showDetail={showDetail}
                      detailSummaryLabel={isCompound ? "신청·결재 상세" : "상세보기"}
                    >
                      {detailBlock}
                    </MyLeaveRequestFooter>
                  );
                })()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
