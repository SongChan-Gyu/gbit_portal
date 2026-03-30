import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getFiscalYear } from "@/lib/workdays";
import { formatMDWithDay, formatYMD } from "@/lib/dateUtils";
import { getTenureScheduleForFiscalYears } from "@/lib/scheduler";
import CancelButton from "./CancelButton";
import CancelRequestButton from "./CancelRequestButton";
import MyLeaveMonthlyTable from "./MyLeaveMonthlyTable";
import { redirect } from "next/navigation";
import { mergedLeaveTypeLabel } from "@/lib/leaveDisplay";

const STATUS_BADGE: Record<string,string> = {
  PENDING:"badge-warning",  APPROVED:"badge-success",
  REJECTED:"badge-danger",  CANCELLED:"badge-default",
  WITHDRAWN:"badge-default",
  CANCEL_REQUESTED:"badge-warning",
};
const STATUS_KO: Record<string,string> = {
  PENDING:"대기", APPROVED:"승인", REJECTED:"반려",
  CANCELLED:"취소", WITHDRAWN:"철회", CANCEL_REQUESTED:"취소심사",
};

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

  const fyStart = new Date(`${fy}-05-01`);
  const fyEnd   = new Date(`${fy+1}-04-30`);
  const fyRangeLabel = `${formatYMD(fyStart)} ~ ${formatYMD(fyEnd)}`;

  const [allocations, requests, tenureScheduleAll, reasonNoPoolLeaveTypes] = await Promise.all([
    prisma.leaveAllocation.findMany({
      where: {
        employeeId: user.employeeId,
        isActive: true,
        validFrom: { lte: new Date() },  // 아직 시작 안 된 미래 귀속연도 제외
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
        deductFromBalance: false,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  // 이번·다음 귀속연도 중 본인 근속휴가 부여 예정 (언제부터 쓸 수 있는지 보여주기 위함)
  const myTenureSchedule = tenureScheduleAll.filter((r) => r.employeeId === user.employeeId);
  const tenureThisFy = myTenureSchedule.filter((r) => r.fiscalYear === fy);
  const tenureNextFy = myTenureSchedule.filter((r) => r.fiscalYear === fy + 1);

  const now = new Date();
  // 같은 귀속연도에 근속휴가(TENURE_1Y/5Y/10Y)가 fiscalYear null + fy 두 개 있으면 하나만 표시 (init 중복 방지)
  const TENURE_CODES = new Set(["TENURE_1Y", "TENURE_5Y", "TENURE_10Y"]);
  const ANNUAL_POOL_SOURCES = new Set(["BASE_ANNUAL", "TENURE_BONUS", "CARRYOVER"]);
  const rawFyAllocs = allocations.filter((a) => a.fiscalYear === fy || !a.fiscalYear);
  const byTenureSource = new Map<string, (typeof rawFyAllocs)[0]>();
  const fyAllocs: (typeof rawFyAllocs)[0][] = [];
  const annualPoolRows = rawFyAllocs.filter((a) => ANNUAL_POOL_SOURCES.has(a.sourceCode));
  const baseDays = annualPoolRows.find((a) => a.sourceCode === "BASE_ANNUAL")?.totalDays ?? 0;
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
    } else if (!ANNUAL_POOL_SOURCES.has(a.sourceCode)) {
      fyAllocs.push(a);
    }
  }
  fyAllocs.push(...annualMerged);
  byTenureSource.forEach((a) => fyAllocs.push(a));

  // 총 부여/사용/잔여: 소모 가능 자산만 (공가·병가 성격의 부여는 합계에서 제외 — 혼동 방지)
  const KPI_ASSET_SOURCE_CODES = new Set([
    "ANNUAL",
    "BASE_ANNUAL", "TENURE_BONUS", "CARRYOVER",
    "CARE", "HOLIDAY_EXT", "AWARD", "BIRTHDAY_HALF", "DUTY_DEPT",
    "TENURE_1Y", "TENURE_5Y", "TENURE_10Y",
  ]);
  const validAllocs = fyAllocs.filter((a) => now >= new Date(a.validFrom) && now <= new Date(a.validUntil));
  const kpiAllocs = validAllocs.filter((a) => KPI_ASSET_SOURCE_CODES.has(a.sourceCode));
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
                        부여 <span className="text-gray-400">—</span>
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
                          <td className="text-right text-gray-400">—</td>
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

      {/* 이번 귀속연도 중 근속휴가 부여 예정 — 언제부터 사용 가능한지 안내 */}
      {(tenureThisFy.length > 0 || tenureNextFy.length > 0) && (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">근속휴가 부여 예정</span>
            <span className="text-xs text-gray-500 font-normal">
              입사 기념일 도래 시 스케줄러가 자동 부여 · 부여일부터 사용 가능
            </span>
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
                      <th className="px-3 py-2 text-center font-semibold">상태</th>
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
                      <th className="px-3 py-2 text-center font-semibold">상태</th>
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
          <div className="panel-body text-center py-10 text-gray-400">
            <p>신청 내역이 없습니다.</p>
          </div>
        ) : (
          <ul className="p-3 space-y-3 md:p-0 md:space-y-0 md:divide-y md:divide-gray-100">
            {requests.map((req) => (
              <li key={req.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm md:rounded-none md:border-0 md:shadow-none md:px-4 md:py-3 md:hover:bg-gray-50/50">
                <div className="p-4 md:p-0">
                  <div className="flex justify-between items-start gap-3 mb-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium text-gray-900 leading-snug">
                        {req.items.length === 1
                          ? mergedLeaveTypeLabel(req.items[0]!.leaveType as any, { timeSlot: req.items[0]!.timeSlot ?? null }).mergedName
                          : `복합 신청 (${req.items.length}건)`}
                      </p>
                      <p className="text-sm text-gray-600">
                        {formatMDWithDay(req.startDate)}
                        {req.startDate.toDateString() !== req.endDate.toDateString() && ` ~ ${formatMDWithDay(req.endDate)}`}
                        <span className="text-slate-800 font-semibold ml-1 tabular-nums">· {req.totalDays}일</span>
                      </p>
                    </div>
                    <span className={`badge shrink-0 whitespace-nowrap ${STATUS_BADGE[req.status]}`}>
                      {STATUS_KO[req.status]}
                    </span>
                  </div>
                  {req.items.length > 1 && (
                    <ul className="mt-3 space-y-2 text-sm border-t border-gray-100 pt-3">
                      {req.items.map((it) => (
                        <li key={it.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          {(() => {
                            const { mergedName, mergedColor } = mergedLeaveTypeLabel(it.leaveType as any, { timeSlot: it.timeSlot ?? null });
                            return (
                              <span className="font-medium text-gray-800 shrink-0" style={{ color: mergedColor ?? it.leaveType.color }}>
                                {mergedName}
                              </span>
                            );
                          })()}
                          <span className="text-gray-500 text-xs">
                            {formatMDWithDay(it.startDate)}
                            {it.startDate.toDateString() !== it.endDate.toDateString() &&
                              ` ~ ${formatMDWithDay(it.endDate)}`}
                          </span>
                          <span className="text-slate-600 tabular-nums text-xs font-semibold">{it.days}일</span>
                          {it.reason?.trim() && it.reason.trim().length >= 2 && (
                            <span className="text-gray-400 text-xs w-full">사유: {it.reason.trim()}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {(() => {
                  const hasItemReason = req.items.some((it) => it.reason?.trim() && it.reason.trim().length >= 2);
                  const hasMeta = req.approvals.length > 0 || hasItemReason;
                  const detailBlock = hasMeta ? (
                    <div className="space-y-1 text-xs text-gray-600 leading-relaxed">
                      {req.approvals.length > 0 && (
                        <p>
                          <span className="text-gray-400">결재</span>{" "}
                          {req.approvals.map((a) => `${a.approver.name}${a.status==="APPROVED"?" ✓":a.status==="REJECTED"?" ✗":""}`).join(" → ")}
                        </p>
                      )}
                      {hasItemReason && (
                        <p>
                          <span className="text-gray-400">사유</span>{" "}
                          {req.items.filter((it) => it.reason?.trim() && it.reason.trim().length >= 2).map((it) => it.reason!.trim()).join(" / ")}
                        </p>
                      )}
                    </div>
                  ) : null;
                  return (
                <div className="grid grid-cols-2 border-t border-gray-100 divide-x divide-gray-100 bg-gray-50/90 md:bg-gray-50/30">
                  <div className="flex min-h-[48px] items-stretch">
                    {req.status === "PENDING" && (
                      <CancelButton requestId={req.id} className="flex-1 w-full rounded-none min-h-[48px] justify-center border-0 bg-transparent hover:bg-red-50 text-sm font-medium" />
                    )}
                    {req.status === "APPROVED" && (
                      <CancelRequestButton requestId={req.id} className="flex-1 w-full rounded-none min-h-[48px] justify-center border-0 border-transparent bg-transparent hover:bg-orange-50 text-sm font-medium" />
                    )}
                    {req.status === "CANCEL_REQUESTED" && (
                      <span className="flex flex-1 items-center justify-center text-xs text-orange-800 bg-orange-50/90">취소심사 중</span>
                    )}
                    {!["PENDING", "APPROVED", "CANCEL_REQUESTED"].includes(req.status) && (
                      <span className="flex flex-1 items-center justify-center text-xs text-gray-400">—</span>
                    )}
                  </div>
                  {detailBlock ? (
                    <details className="group min-h-[48px] flex flex-col justify-center bg-white/80 open:bg-white">
                      <summary className="list-none cursor-pointer select-none min-h-[48px] flex items-center justify-center text-sm font-medium text-slate-700 hover:bg-slate-50 px-2">
                        상세보기
                      </summary>
                      <div className="px-3 pb-3 border-t border-gray-100 bg-white text-left">{detailBlock}</div>
                    </details>
                  ) : (
                    <div className="flex min-h-[48px] items-center justify-center text-xs text-gray-300">—</div>
                  )}
                </div>
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
