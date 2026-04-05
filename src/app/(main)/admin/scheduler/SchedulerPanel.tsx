"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Calendar, Award, Play, RefreshCw, CheckCircle, XCircle,
  AlertCircle, Eye, History, Clock, Users, ChevronDown, ChevronRight,
  FlaskConical, Zap, ListChecks, Search,
} from "lucide-react";
import DatePickerButton from "@/components/ui/DatePickerButton";
import TenureScheduleClient from "@/app/(main)/admin/leave-management/TenureScheduleClient";
import { todayKstYmd } from "@/lib/dateUtils";
import { getFiscalYear } from "@/lib/workdays";

// ─────────────── 타입 ───────────────────────────────
interface JobItem {
  employeeId: string; name: string; teamName?: string;
  month?: string; code?: string; days: number; anniversary?: string;
  reason?: string; error?: string;
}
interface JobResult {
  success: boolean; isDryRun: boolean;
  granted: number; skipped: number; errors: number;
  detail: { granted: JobItem[]; skipped: JobItem[]; errors: JobItem[] };
}
interface SchedulerLog {
  id: string; jobName: string; targetParam: string|null;
  isDryRun: boolean; status: string;
  grantedCount: number; skippedCount: number; errorCount: number;
  detail: string|null; triggeredBy: string; createdAt: string;
}
interface GrantRow {
  id: string; employeeId: string; empName: string; empNo: string; teamName: string;
  hireDate: string; sourceCode: string; typeLabel: string; isMonthly: boolean;
  label: string; totalDays: number; usedDays: number; remain: number;
  validFrom: string; validUntil: string; note: string | null;
  isActive: boolean; status: string; createdAt: string;
}

interface TenurePreview {
  employeeId:string; name:string; teamName:string; code:string;
  label:string; years:number; days:number; anniversary:string;
  daysLeft:number; alreadyGranted:boolean;
}
interface AccrualPreview {
  employeeId:string; name:string; teamName:string;
  hireDate:string; monthsWorked:number; alreadyGranted:boolean;
}

// ─────────────── 유틸 컴포넌트 ─────────────────────
function Pill({ n, type }: { n:number; type:"ok"|"skip"|"err" }) {
  const s = type==="ok"  ? "bg-green-100 text-green-700"
          : type==="skip"? "bg-gray-100 text-gray-500"
          : "bg-red-100 text-red-600";
  const l = type==="ok"?"부여":type==="skip"?"건너뜀":"오류";
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${s}`}>{l} {n}</span>;
}

function StatusBadge({ status }: { status:string }) {
  const s = status==="SUCCESS"?"bg-green-100 text-green-700"
          : status==="PARTIAL"?"bg-amber-100 text-amber-700"
          : "bg-red-100 text-red-600";
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s}`}>{status}</span>;
}

function ResultBlock({ result }: { result: JobResult }) {
  const [showSkip, setShowSkip] = useState(false);
  return (
    <div className="space-y-2.5 mt-3">
      <div className={`flex flex-wrap items-center gap-2 text-sm px-4 py-2.5 rounded-lg border
        ${result.isDryRun ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-green-50 text-green-700 border-green-100"}`}>
        {result.isDryRun ? <FlaskConical size={14}/> : <CheckCircle size={14}/>}
        {result.isDryRun ? "드라이런 완료 (실제 적용 안됨)" : "실행 완료"}
        <Pill n={result.granted} type="ok"/>
        <Pill n={result.skipped} type="skip"/>
        <Pill n={result.errors}  type="err"/>
      </div>
      {result.detail.granted.length > 0 && (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 flex items-center gap-1.5">
            <CheckCircle size={12} className="text-green-600"/>
            {result.isDryRun ? "부여 예정" : "부여 완료"} {result.detail.granted.length}명
          </div>
          <table className="w-full text-xs">
            <tbody>
              {result.detail.granted.map((g, i) => (
                <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-800">{g.name}</td>
                  <td className="px-3 py-2 text-gray-500">{g.month ?? g.code} {g.anniversary && `(${g.anniversary})`}</td>
                  <td className="px-3 py-2 font-semibold text-blue-700">+{g.days}일</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.detail.errors.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-xs text-red-700 space-y-1">
          {result.detail.errors.map((e, i) => (
            <div key={i}><strong>{e.name}</strong>: {e.error}</div>
          ))}
        </div>
      )}
      {result.detail.skipped.length > 0 && (
        <div>
          <button onClick={() => setShowSkip(v => !v)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition">
            {showSkip ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
            건너뜀 {result.detail.skipped.length}명 {showSkip?"숨기기":"보기"}
          </button>
          {showSkip && (
            <div className="mt-1.5 space-y-0.5 pl-3 text-xs text-gray-500 border-l-2 border-gray-200">
              {result.detail.skipped.map((s, i) => (
                <div key={i}>{s.name}: {s.reason}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────── 메인 컴포넌트 ──────────────────────
type SchedulerPanelProps = { currentFy?: number };
export default function SchedulerPanel({ currentFy: propFy }: SchedulerPanelProps = {}) {
  const currentFy = propFy ?? getFiscalYear();
  const [tab, setTab] = useState<"accrual"|"tenure"|"birthday"|"logs"|"grants">("tenure");

  // ── 탭: 월별 적립
  const [accrualMonth, setAccrualMonth] = useState(() => {
    const tk = todayKstYmd();
    const [y, m] = tk.split("-").map(Number);
    let pm = m - 1;
    let py = y;
    if (pm < 1) {
      pm = 12;
      py -= 1;
    }
    return `${py}-${String(pm).padStart(2, "0")}`;
  });
  const [accrualRunning, setAccrualRunning] = useState(false);
  const [accrualResult, setAccrualResult]   = useState<JobResult|null>(null);
  const [accrualErr, setAccrualErr]         = useState("");
  const [accrualCandidates, setAccrualCandidates] = useState<AccrualPreview[]|null>(null);
  const [accrualPreviewMonth, setAccrualPreviewMonth] = useState("");
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // ── 탭: 근속 체크
  const [tenureDate, setTenureDate] = useState(() => todayKstYmd());
  const [tenureWindow, setTenureWindow] = useState(0);
  const [tenureRunning, setTenureRunning] = useState(false);
  const [tenureResult, setTenureResult]   = useState<JobResult|null>(null);
  const [tenureErr, setTenureErr]         = useState("");
  const [upcoming, setUpcoming]           = useState<TenurePreview[]|null>(null);
  const [upcomingDays, setUpcomingDays]   = useState(30);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);

  // ── 탭: 생일반차 (달력 일 단위 — 해당 날짜에 생일인 직원만)
  const [birthdayDate, setBirthdayDate] = useState(() => todayKstYmd());
  const [birthdayRunning, setBirthdayRunning] = useState(false);
  const [birthdayResult, setBirthdayResult] = useState<JobResult|null>(null);
  const [birthdayErr, setBirthdayErr] = useState("");

  // ── 탭: 이력
  const [logs, setLogs]         = useState<SchedulerLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logDetail, setLogDetail] = useState<string|null>(null);

  // ── 탭: 부여 이력
  const [grants, setGrants]             = useState<GrantRow[]>([]);
  const [grantsTotal, setGrantsTotal]   = useState(0);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [grantsType, setGrantsType]     = useState<"all"|"monthly"|"tenure">("all");
  const [grantsEmpFilter, setGrantsEmpFilter] = useState("");
  const [grantsPage, setGrantsPage]     = useState(0);
  const PAGE_SIZE = 30;

  // ── 이력 로드
  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    const res = await fetch("/api/cron/logs?take=30");
    const data = await res.json();
    setLogs(data.logs ?? []);
    setLogsLoading(false);
  }, []);

  useEffect(() => { if (tab === "logs") loadLogs(); }, [tab, loadLogs]);

  // ── 부여 이력 로드
  const loadGrants = useCallback(async (type: string, page: number) => {
    setGrantsLoading(true);
    const params = new URLSearchParams({
      type, take: String(PAGE_SIZE), skip: String(page * PAGE_SIZE),
    });
    const res  = await fetch(`/api/admin/grant-history?${params}`);
    const data = await res.json();
    setGrants(data.rows ?? []);
    setGrantsTotal(data.total ?? 0);
    setGrantsLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "grants") loadGrants(grantsType, grantsPage);
  }, [tab, grantsType, grantsPage, loadGrants]);

  // ── 근속 기념일 예정자 로드
  async function loadUpcoming() {
    setLoadingUpcoming(true);
    const res = await fetch(`/api/cron/preview?type=tenure&days=${upcomingDays}`);
    const data = await res.json();
    setUpcoming(data.data ?? []);
    setLoadingUpcoming(false);
  }

  // ── 월별 적립 예정자 로드
  async function loadCandidates() {
    setLoadingCandidates(true);
    const m = accrualMonth;
    const res = await fetch(`/api/cron/preview?type=accrual&month=${m}`);
    const data = await res.json();
    setAccrualCandidates(data.data?.candidates ?? []);
    setAccrualPreviewMonth(data.data?.monthStr ?? m);
    setLoadingCandidates(false);
  }

  // ── 월별 적립 실행
  async function runAccrual(dry: boolean) {
    if (!dry && !confirm(`${accrualMonth} 월별 연차 적립을 실제 적용하시겠습니까?`)) return;
    setAccrualRunning(true); setAccrualErr(""); setAccrualResult(null);
    const res = await fetch("/api/cron/monthly-accrual", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ month: accrualMonth, dryRun: dry }),
    });
    const data = await res.json();
    setAccrualRunning(false);
    if (!res.ok) { setAccrualErr(data.error ?? "실패"); return; }
    setAccrualResult(data);
    if (!dry && tab === "logs") loadLogs();
  }

  // ── 근속 체크 실행
  async function runTenure(dry: boolean) {
    if (!dry && !confirm(`${tenureDate} 기준 근속 기념일 체크를 실제 적용하시겠습니까?`)) return;
    setTenureRunning(true); setTenureErr(""); setTenureResult(null);
    const res = await fetch("/api/cron/tenure-check", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ date: tenureDate, window: tenureWindow, dryRun: dry }),
    });
    const data = await res.json();
    setTenureRunning(false);
    if (!res.ok) { setTenureErr(data.error ?? "실패"); return; }
    setTenureResult(data);
    if (!dry && tab === "logs") loadLogs();
  }

  // ── 생일반차 실행
  async function runBirthdayHalf(dry: boolean) {
    if (!dry && !confirm(`${birthdayDate} 생일인 직원에게 생일반차를 실제 부여하시겠습니까?`)) return;
    setBirthdayRunning(true); setBirthdayErr(""); setBirthdayResult(null);
    const res = await fetch("/api/cron/birthday-half", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ date: birthdayDate, dryRun: dry }),
    });
    const data = await res.json();
    setBirthdayRunning(false);
    if (!res.ok) { setBirthdayErr(data.error ?? "실패"); return; }
    setBirthdayResult({
      success: true,
      isDryRun: data.isDryRun,
      granted: data.detail?.granted?.length ?? 0,
      skipped: data.detail?.skipped?.length ?? 0,
      errors: data.detail?.errors?.length ?? 0,
      detail: {
        granted: (data.detail?.granted ?? []).map(
          (g: { name: string; birthMonth: number; birthdayDateStr?: string }) => ({
            ...g,
            name: g.name,
            anniversary: g.birthdayDateStr ?? `${g.birthMonth}월`,
            days: 0.5,
          }),
        ),
        skipped: data.detail?.skipped ?? [],
        errors: data.detail?.errors ?? [],
      },
    });
    if (!dry && tab === "logs") loadLogs();
  }

  const TABS = [
    { id:"tenure",  label:"근속 기념일", icon:Award },
    { id:"accrual", label:"월별 적립",   icon:Calendar },
    { id:"birthday", label:"생일반차",   icon:Zap },
    { id:"grants",  label:"부여 이력",   icon:ListChecks },
    { id:"logs",    label:"실행 로그",   icon:History },
  ] as const;

  return (
    <div className="space-y-4">
      {/* 안내 */}
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 flex gap-2">
        <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-500"/>
        <div>
          <strong>드라이런(미리보기)</strong>은 DB를 변경하지 않고 결과만 확인합니다.
          실제 적용 전 반드시 먼저 드라이런으로 확인하세요.
          동일 작업을 중복 실행해도 <strong>이미 처리된 건은 자동으로 건너뜁니다.</strong>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              tab === id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            <Icon size={14}/> {label}
          </button>
        ))}
      </div>

      {/* ── 탭: 근속 기념일 ─────────────────────────────── */}
      {tab === "tenure" && (
        <div className="space-y-4">
          {/* 예정자 조회 */}
          <div className="rounded-xl border border-violet-200 overflow-hidden">
            <div className="bg-violet-50/60 border-b border-violet-100 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-violet-600"/>
                <span className="font-semibold text-sm text-gray-800">근속 기념일 예정자</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" min={1} max={365} className="input w-20 text-sm py-1 px-2"
                  value={upcomingDays} onChange={e => setUpcomingDays(parseInt(e.target.value)||30)}/>
                <span className="text-xs text-gray-500">일 이내</span>
                <button onClick={loadUpcoming} disabled={loadingUpcoming}
                  className="flex items-center gap-1.5 text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-60">
                  {loadingUpcoming ? <RefreshCw size={12} className="animate-spin"/> : <Eye size={12}/>}
                  조회
                </button>
              </div>
            </div>
            {upcoming === null ? (
              <div className="text-center py-8 text-sm text-gray-400">위 "조회" 버튼을 눌러 확인하세요</div>
            ) : upcoming.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">{upcomingDays}일 이내 기념일 예정자 없음</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">직원</th>
                    <th className="px-4 py-2.5 text-left font-semibold hidden sm:table-cell">팀</th>
                    <th className="px-4 py-2.5 text-left font-semibold">구분</th>
                    <th className="px-4 py-2.5 text-center font-semibold">기념일</th>
                    <th className="px-4 py-2.5 text-center font-semibold">D-day</th>
                    <th className="px-4 py-2.5 text-center font-semibold">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {upcoming.map((u, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{u.name}</td>
                      <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">{u.teamName}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded font-medium">{u.label}</span>
                        <span className="text-xs text-gray-400 ml-1">+{u.days}일</span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs text-gray-600">{u.anniversary}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-xs font-bold ${u.daysLeft===0?"text-red-600":u.daysLeft<=7?"text-amber-600":"text-gray-600"}`}>
                          {u.daysLeft === 0 ? "오늘!" : `D-${u.daysLeft}`}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {u.alreadyGranted
                          ? <span className="text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">부여완료</span>
                          : <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">미부여</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 실행 패널 */}
          <div className="rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
              <Zap size={15} className="text-violet-600"/> 근속 기념일 체크 실행
            </h3>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label">기준 날짜</label>
                <DatePickerButton value={tenureDate} onChange={setTenureDate} className="w-44" />
                <p className="text-xs text-gray-400 mt-1">오늘 날짜 = 당일 기념일 체크</p>
              </div>
              <div>
                <label className="label">허용 범위 ±일</label>
                <input type="number" min={0} max={30} className="input w-20" value={tenureWindow}
                  onChange={e => setTenureWindow(parseInt(e.target.value)||0)}/>
                <p className="text-xs text-gray-400 mt-1">0 = 당일만</p>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => runTenure(true)} disabled={tenureRunning}
                  className="flex items-center gap-1.5 text-sm bg-slate-100 text-slate-700 px-4 py-2.5 rounded-lg hover:bg-slate-200 disabled:opacity-60 font-medium transition">
                  {tenureRunning ? <RefreshCw size={13} className="animate-spin"/> : <FlaskConical size={13}/>}
                  드라이런
                </button>
                <button onClick={() => runTenure(false)} disabled={tenureRunning}
                  className="flex items-center gap-1.5 text-sm bg-violet-600 text-white px-4 py-2.5 rounded-lg hover:bg-violet-700 disabled:opacity-60 font-medium transition">
                  {tenureRunning ? <RefreshCw size={13} className="animate-spin"/> : <Play size={13}/>}
                  실제 적용
                </button>
              </div>
            </div>
            {tenureErr && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-lg border border-red-100">
                <XCircle size={14}/> {tenureErr}
              </div>
            )}
            {tenureResult && <ResultBlock result={tenureResult}/>}
          </div>

          {/* 이번·다음 귀속연도 근속휴가 예정 (전체) — 관리자용 */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 text-sm font-semibold text-gray-800">
              이번·다음 귀속연도 근속휴가 부여 예정 (전체)
            </div>
            <div className="p-4">
              <TenureScheduleClient currentFy={currentFy} />
            </div>
          </div>
        </div>
      )}

      {/* ── 탭: 월별 적립 ─────────────────────────────────── */}
      {tab === "accrual" && (
        <div className="space-y-4">
          {/* 예정자 조회 */}
          <div className="rounded-xl border border-blue-200 overflow-hidden">
            <div className="bg-blue-50/60 border-b border-blue-100 px-5 py-3 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-blue-600"/>
                <span className="font-semibold text-sm text-gray-800">월별 적립 예정자 조회</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="month" className="input text-sm py-1 px-2 w-36"
                  value={accrualMonth} onChange={e => setAccrualMonth(e.target.value)}/>
                <button onClick={loadCandidates} disabled={loadingCandidates}
                  className="flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-60">
                  {loadingCandidates ? <RefreshCw size={12} className="animate-spin"/> : <Eye size={12}/>}
                  조회
                </button>
              </div>
            </div>
            {accrualCandidates === null ? (
              <div className="text-center py-8 text-sm text-gray-400">위 "조회" 버튼을 눌러 확인하세요</div>
            ) : accrualCandidates.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">{accrualPreviewMonth} 월별 적립 대상자 없음 (입사 1년 미만 재직자 없음)</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">직원</th>
                    <th className="px-4 py-2.5 text-left font-semibold hidden sm:table-cell">팀</th>
                    <th className="px-4 py-2.5 text-center font-semibold">입사일</th>
                    <th className="px-4 py-2.5 text-center font-semibold">근속 개월</th>
                    <th className="px-4 py-2.5 text-center font-semibold">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {accrualCandidates.map((c, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{c.name}</td>
                      <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">{c.teamName}</td>
                      <td className="px-4 py-2.5 text-center text-xs text-gray-600">{c.hireDate}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-xs font-medium text-blue-700">{c.monthsWorked}개월차</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {c.alreadyGranted
                          ? <span className="text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">적립완료</span>
                          : <span className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">적립예정</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 실행 패널 */}
          <div className="rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
              <Zap size={15} className="text-blue-600"/> 월별 연차 적립 실행
            </h3>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label">적립 대상 월</label>
                <input type="month" className="input w-44" value={accrualMonth}
                  onChange={e => setAccrualMonth(e.target.value)}/>
                <p className="text-xs text-gray-400 mt-1">기본값: 지난달</p>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => runAccrual(true)} disabled={accrualRunning}
                  className="flex items-center gap-1.5 text-sm bg-slate-100 text-slate-700 px-4 py-2.5 rounded-lg hover:bg-slate-200 disabled:opacity-60 font-medium transition">
                  {accrualRunning ? <RefreshCw size={13} className="animate-spin"/> : <FlaskConical size={13}/>}
                  드라이런
                </button>
                <button onClick={() => runAccrual(false)} disabled={accrualRunning}
                  className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium transition">
                  {accrualRunning ? <RefreshCw size={13} className="animate-spin"/> : <Play size={13}/>}
                  실제 적용
                </button>
              </div>
            </div>
            {accrualErr && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-lg border border-red-100">
                <XCircle size={14}/> {accrualErr}
              </div>
            )}
            {accrualResult && <ResultBlock result={accrualResult}/>}
          </div>
        </div>
      )}

      {/* ── 탭: 생일반차 ─────────────────────────────────────── */}
      {tab === "birthday" && (
        <div className="space-y-4">
          <div className="rounded-xl bg-pink-50/60 border border-pink-200 px-4 py-3 text-xs text-pink-800">
            생년월일이 입력된 재직자 중, <strong>선택한 달력 날짜</strong>에 생일이 도래한 직원에게만 생일반차 0.5일을 부여합니다.
            외부 자동 실행(cron)에서 월 단위로 돌리려면 API에 <code className="bg-pink-100 px-1 rounded">yearMonth: &quot;YYYY-MM&quot;</code>를 넘기면 됩니다.
          </div>
          <div className="rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
              <Zap size={15} className="text-pink-600"/> 생일반차 부여
            </h3>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label">대상 날짜 (생일)</label>
                <DatePickerButton value={birthdayDate} onChange={setBirthdayDate} className="max-w-[220px]" />
                <p className="text-xs text-gray-400 mt-1">이 날짜의 월·일과 생일이 같은 직원만 부여</p>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => runBirthdayHalf(true)} disabled={birthdayRunning}
                  className="flex items-center gap-1.5 text-sm bg-slate-100 text-slate-700 px-4 py-2.5 rounded-lg hover:bg-slate-200 disabled:opacity-60 font-medium transition">
                  {birthdayRunning ? <RefreshCw size={13} className="animate-spin"/> : <FlaskConical size={13}/>}
                  드라이런
                </button>
                <button onClick={() => runBirthdayHalf(false)} disabled={birthdayRunning}
                  className="flex items-center gap-1.5 text-sm bg-pink-600 text-white px-4 py-2.5 rounded-lg hover:bg-pink-700 disabled:opacity-60 font-medium transition">
                  {birthdayRunning ? <RefreshCw size={13} className="animate-spin"/> : <Play size={13}/>}
                  실제 적용
                </button>
              </div>
            </div>
            {birthdayErr && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-lg border border-red-100">
                <XCircle size={14}/> {birthdayErr}
              </div>
            )}
            {birthdayResult && <ResultBlock result={birthdayResult}/>}
          </div>
        </div>
      )}

      {/* ── 탭: 실행 이력 ──────────────────────────────────── */}
      {tab === "logs" && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">최근 30건 실행 이력</p>
            <button onClick={loadLogs} disabled={logsLoading}
              className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded hover:bg-gray-100 transition">
              <RefreshCw size={12} className={logsLoading?"animate-spin":""}/> 새로고침
            </button>
          </div>
          {logsLoading ? (
            <div className="text-center py-10 text-sm text-gray-400">불러오는 중...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-400">실행 이력이 없습니다</div>
          ) : (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">작업</th>
                    <th className="px-4 py-2.5 text-left font-semibold hidden md:table-cell">대상</th>
                    <th className="px-4 py-2.5 text-center font-semibold">결과</th>
                    <th className="px-4 py-2.5 text-center font-semibold">부여/건너뜀/오류</th>
                    <th className="px-4 py-2.5 text-center font-semibold hidden sm:table-cell">트리거</th>
                    <th className="px-4 py-2.5 text-left font-semibold">실행시각</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <>
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {log.jobName === "monthly_accrual"
                              ? <Calendar size={13} className="text-blue-500"/>
                              : log.jobName === "birthday_half"
                              ? <Zap size={13} className="text-pink-500"/>
                              : <Award size={13} className="text-violet-500"/>}
                            <span className="text-xs font-medium text-gray-700">
                              {log.jobName === "monthly_accrual" ? "월별적립" : log.jobName === "birthday_half" ? "생일반차" : "근속체크"}
                            </span>
                            {log.isDryRun && (
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">드라이런</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">{log.targetParam ?? "-"}</td>
                        <td className="px-4 py-3 text-center"><StatusBadge status={log.status}/></td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs">
                            <span className="text-green-700 font-semibold">{log.grantedCount}</span>
                            <span className="text-gray-400"> / {log.skippedCount} / </span>
                            <span className={log.errorCount > 0 ? "text-red-600 font-semibold" : "text-gray-400"}>{log.errorCount}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center hidden sm:table-cell">
                          <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{log.triggeredBy}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          <div className="flex items-center gap-1">
                            <Clock size={11}/>
                            {new Date(log.createdAt).toLocaleString("ko-KR", { month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" })}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {log.detail && (
                            <button onClick={() => setLogDetail(logDetail === log.id ? null : log.id)}
                              className="text-[11px] text-blue-600 hover:text-blue-800 px-2 py-0.5 rounded hover:bg-blue-50 transition">
                              {logDetail === log.id ? "닫기" : "상세"}
                            </button>
                          )}
                        </td>
                      </tr>
                      {logDetail === log.id && log.detail && (
                        <tr key={`${log.id}-detail`}>
                          <td colSpan={7} className="px-4 pb-3 bg-gray-50">
                            <pre className="text-[11px] text-gray-600 overflow-x-auto bg-white border border-gray-200 rounded p-3 max-h-60">
                              {JSON.stringify(JSON.parse(log.detail), null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
