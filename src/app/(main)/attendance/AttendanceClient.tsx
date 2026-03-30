"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays, BarChart3 } from "lucide-react";
import { formatYMD } from "@/lib/dateUtils";
import { mergedLeaveTypeLabel } from "@/lib/leaveDisplay";

// ── 약어 매핑
const ABBR: Record<string, string> = {
  ANNUAL:"연",   AM_HALF:"오전",  PM_HALF:"오후",
  CONDOLENCE:"경조", CARE:"돌봄",  PUBLIC:"공가",
  PUBLIC_AM:"전공", PUBLIC_PM:"후공",
  RECOGNITION:"인정", RECOGNITION_AM:"전인", RECOGNITION_PM:"후인",
  PM_HALF_MONTH:"하프", SICK:"병가", HEALING_DAY:"힐링",
  PM_RECOG_STAMP:"스탬프", TENURE_1Y:"근1", TENURE_5Y:"근5",
  TENURE_10Y:"근10", AWARD:"포상",
};

type ReqItem = {
  leaveTypeCode:string; leaveTypeName:string; leaveTypeColor:string;
  days:number; startDate:string; endDate:string;
  isHalf?:boolean; isAmOnly?:boolean; isPmOnly?:boolean;
  allowsFullDay?: boolean | null;
  allowsHalfDay?: boolean | null;
  halfDayAmPm?: string | null;
  leaveTypeApplyGroupKey?: string | null;
  timeSlot?: string | null;
};
type Req = {
  id:string; employeeId:string; startDate:string; endDate:string;
  totalDays?:number; items:ReqItem[];
};
type Emp = { id:string; name:string; position:string; teamName:string; hireDate:string|null };
type Alloc = { id:string; employeeId:string; sourceCode:string; label:string; totalDays:number; usedDays:number };
type LT = { id:string; code:string; name:string; color:string; isHalf:boolean };

interface Props {
  employees:Emp[]; monthRequests:Req[]; annualRequests:Req[]; allocations:Alloc[];
  holidays:string[]; leaveTypes:LT[];
  year:number; month:number; fy:number;
  isAdmin:boolean; initView:string;
}

const MONTH_LABELS = ["5월","6월","7월","8월","9월","10월","11월","12월","1월","2월","3월","4월"];
const DAYS_OF_WEEK = ["일","월","화","수","목","금","토"];

function daysInMonth(y:number, m:number) { return new Date(y, m, 0).getDate(); }
function pad2(n:number) { return String(n).padStart(2,"0"); }

export default function AttendanceClient({
  employees, monthRequests, annualRequests, allocations,
  holidays, leaveTypes, year, month, fy, isAdmin, initView,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState(initView); // "monthly" | "annual"
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);

  // ── 이전/다음 달 이동
  const prev = month === 1 ? { y:year-1, m:12 } : { y:year, m:month-1 };
  const next = month === 12 ? { y:year+1, m:1  } : { y:year, m:month+1 };
  const navTo = (y:number, m:number) => router.push(`?year=${y}&month=${m}&view=${view}`);

  // ── 일별 휴가 맵 (월간)
  const empDayMap = useMemo(() => {
    const map = new Map<string, Map<string, ReqItem[]>>();
    for (const req of monthRequests) {
      if (!map.has(req.employeeId)) map.set(req.employeeId, new Map());
      const dm = map.get(req.employeeId)!;
      for (const item of req.items) {
        const s = new Date(item.startDate);
        const e = new Date(item.endDate);
        const cur = new Date(s);
        while (cur <= e) {
          if (cur.getFullYear() === year && cur.getMonth() === month-1) {
            const k = String(cur.getDate());
            if (!dm.has(k)) dm.set(k, []);
            dm.get(k)!.push(item);
          }
          cur.setDate(cur.getDate() + 1);
        }
      }
    }
    return map;
  }, [monthRequests, year, month]);

  // ── 귀속연도 월별 사용 맵 (연간)
  const empMonthlyMap = useMemo(() => {
    // empId -> monthIdx(0=5월..11=4월) -> days
    const map = new Map<string, number[]>();
    for (const emp of employees) map.set(emp.id, Array(12).fill(0));
    for (const req of annualRequests) {
      const arr = map.get(req.employeeId);
      if (!arr) continue;
      for (const item of req.items) {
        const s = new Date(item.startDate);
        const m = s.getMonth() + 1;
        const idx = m >= 5 ? m - 5 : m + 7;
        arr[idx] += item.days;
      }
    }
    return map;
  }, [annualRequests, employees]);

  // ── 직원별 총 부여일수
  const empTotalMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of allocations) {
      map.set(a.employeeId, (map.get(a.employeeId) ?? 0) + a.totalDays);
    }
    return map;
  }, [allocations]);

  // ── 직원별 총 사용일수
  const empUsedMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of allocations) {
      map.set(a.employeeId, (map.get(a.employeeId) ?? 0) + a.usedDays);
    }
    return map;
  }, [allocations]);

  // ── 팀 그룹
  const grouped = useMemo(() => {
    const g = new Map<string, Emp[]>();
    for (const emp of employees) {
      if (!g.has(emp.teamName)) g.set(emp.teamName, []);
      g.get(emp.teamName)!.push(emp);
    }
    return g;
  }, [employees]);

  const days = daysInMonth(year, month);

  // ── 열 헤더
  const dayHeaders = Array.from({ length: days }, (_, i) => {
    const d = i + 1;
    const dateStr = `${year}-${pad2(month)}-${pad2(d)}`;
    const dow = new Date(year, month-1, d).getDay();
    return { d, dateStr, dow, isWeekend: dow===0||dow===6, isHoliday: holidaySet.has(dateStr) };
  });

  // 일별 합계 (열 바닥)
  const dayTotals = useMemo(() => {
    const totals = Array(days).fill(0);
    for (const [, dm] of empDayMap) {
      for (const [dStr, items] of dm) {
        const d = parseInt(dStr) - 1;
        const used = items.reduce((s, i) => s + i.days, 0);
        totals[d] += used;
      }
    }
    return totals;
  }, [empDayMap, days]);

  // ── 범례용 유형 (월간 요청에 실제로 존재하는 것)
  const usedTypeCodes = useMemo(() => {
    const s = new Set<string>();
    for (const req of monthRequests) req.items.forEach((i) => s.add(i.leaveTypeCode));
    return s;
  }, [monthRequests]);

  function renderMergedAbbr(it: ReqItem): string {
    const { mergedName } = mergedLeaveTypeLabel(
      {
        code: it.leaveTypeCode,
        name: it.leaveTypeName,
        color: it.leaveTypeColor,
        applyGroupKey: it.leaveTypeApplyGroupKey ?? null,
        isHalf: !!it.isHalf,
        isAmOnly: !!it.isAmOnly,
        isPmOnly: !!it.isPmOnly,
        allowsFullDay: it.allowsFullDay ?? null,
        allowsHalfDay: it.allowsHalfDay ?? null,
        halfDayAmPm: it.halfDayAmPm ?? null,
      },
      { timeSlot: it.timeSlot ?? null },
    );
    // 월간 그리드용 짧은 표기(최대 2~3글자 수준)
    if (mergedName.startsWith("연차")) return mergedName.includes("오전") ? "오전" : mergedName.includes("오후") ? "오후" : "연";
    if (mergedName.startsWith("공가")) return mergedName.includes("오전") ? "전공" : mergedName.includes("오후") ? "후공" : "공가";
    if (mergedName.startsWith("인정휴가")) return mergedName.includes("오전") ? "전인" : mergedName.includes("오후") ? "후인" : "인정";
    if (mergedName.startsWith("돌봄휴가")) return mergedName.includes("오전") ? "전돌" : mergedName.includes("오후") ? "후돌" : "돌봄";
    if (mergedName.startsWith("연휴연장휴가")) return mergedName.includes("오전") ? "전연" : mergedName.includes("오후") ? "후연" : "연휴";
    if (mergedName.startsWith("생일반차")) return mergedName.includes("오전") ? "전생" : mergedName.includes("오후") ? "후생" : "생일";
    return ABBR[it.leaveTypeCode] ?? mergedName.slice(0, 2);
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">근태 현황</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
            <button onClick={()=>setView("monthly")}
              className={`px-3 py-1.5 flex items-center gap-1 ${view==="monthly"?"bg-blue-600 text-white":"bg-white text-gray-600 hover:bg-gray-50"}`}>
              <CalendarDays size={13}/> 월간
            </button>
            <button onClick={()=>setView("annual")}
              className={`px-3 py-1.5 flex items-center gap-1 ${view==="annual"?"bg-blue-600 text-white":"bg-white text-gray-600 hover:bg-gray-50"}`}>
              <BarChart3 size={13}/> 귀속연도별
            </button>
          </div>
        </div>
      </div>

      {view === "monthly" ? (
        /* ══ 월간 근태 (엑셀 스타일) ══ */
        <>
          {/* 월 이동 */}
          <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-2">
            <button onClick={()=>navTo(prev.y, prev.m)} className="p-1 hover:bg-gray-100 rounded">
              <ChevronLeft size={16}/>
            </button>
            <span className="font-bold text-gray-800">{year}년 {month}월</span>
            <button onClick={()=>navTo(next.y, next.m)} className="p-1 hover:bg-gray-100 rounded">
              <ChevronRight size={16}/>
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
            <table className="border-collapse attendance-table-mobile" style={{ fontSize:"11px", minWidth:"max-content" }}>
              <thead>
                {/* 팀 헤더 행 */}
                <tr className="bg-[#1e3a5f] text-white">
                  <th className="sticky left-0 z-20 bg-[#1e3a5f] border border-[#2a4a70] px-2 py-1.5 text-left whitespace-nowrap min-w-[60px]">팀</th>
                  <th className="sticky left-[60px] z-20 bg-[#1e3a5f] border border-[#2a4a70] px-2 py-1.5 text-left whitespace-nowrap min-w-[56px]">성명</th>
                  <th className="sticky left-[116px] z-20 bg-[#1e3a5f] border border-[#2a4a70] px-2 py-1.5 text-left whitespace-nowrap min-w-[52px]">직급</th>
                  <th className="bg-[#1e3a5f] border border-[#2a4a70] px-2 py-1.5 text-center whitespace-nowrap">부여일</th>
                  <th className="bg-[#1e3a5f] border border-[#2a4a70] px-2 py-1.5 text-center whitespace-nowrap">사용일</th>
                  <th className="bg-[#1e3a5f] border border-[#2a4a70] px-2 py-1.5 text-center whitespace-nowrap">잔여일</th>
                  {dayHeaders.map(({ d, dow, isWeekend, isHoliday }) => (
                    <th key={d}
                      className={`border border-gray-300 px-0 py-0 text-center min-w-[28px] w-[28px] ${
                        dow===0 ? "bg-red-100 text-red-600" :
                        dow===6 ? "bg-blue-50 text-blue-500" :
                        isHoliday ? "bg-red-50 text-red-500" :
                        "bg-[#1e3a5f] text-white"
                      }`}>
                      <div className="py-0.5">{d}</div>
                      <div className="text-[9px] opacity-70">{DAYS_OF_WEEK[dow]}</div>
                    </th>
                  ))}
                  <th className="bg-[#1e3a5f] border border-[#2a4a70] px-2 py-1.5 text-center whitespace-nowrap">월사용</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(grouped.entries()).map(([teamName, emps]) => (
                  emps.map((emp, ei) => {
                    const dm = empDayMap.get(emp.id) ?? new Map<string, ReqItem[]>();
                    const totalGranted = empTotalMap.get(emp.id) ?? 0;
                    const totalUsed = empUsedMap.get(emp.id) ?? 0;
                    let monthUsed = 0;
                    return (
                      <tr key={emp.id} className={ei % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        {/* 팀명 (첫 행만) */}
                        {ei === 0 ? (
                          <td className="sticky left-0 z-10 bg-inherit border border-gray-200 px-2 py-1 text-center font-medium text-gray-700 whitespace-nowrap"
                            rowSpan={emps.length} style={{ verticalAlign:"middle" }}>
                            {teamName}
                          </td>
                        ) : null}
                        <td className="sticky left-[60px] z-10 bg-inherit border border-gray-200 px-2 py-1 font-medium text-gray-800 whitespace-nowrap">{emp.name}</td>
                        <td className="sticky left-[116px] z-10 bg-inherit border border-gray-200 px-2 py-1 text-gray-600 whitespace-nowrap">{emp.position}</td>
                        <td className="border border-gray-200 px-2 py-1 text-center text-gray-700">{totalGranted}</td>
                        <td className="border border-gray-200 px-2 py-1 text-center text-blue-600 font-medium">{totalUsed}</td>
                        <td className="border border-gray-200 px-2 py-1 text-center text-green-600 font-medium">
                          {Math.max(0, totalGranted - totalUsed)}
                        </td>
                        {dayHeaders.map(({ d, dow, isHoliday }) => {
                          const key = String(d);
                          const items = dm.get(key) ?? [];
                          if (items.length > 0) {
                            monthUsed += items.reduce((s, i) => s + i.days, 0);
                          }
                          const bgClass = dow===0 ? "bg-red-50" : dow===6 ? "bg-blue-50" : isHoliday ? "bg-red-50" : "";
                          if (items.length === 0) {
                            return <td key={d} className={`border border-gray-200 px-0 py-0 ${bgClass}`} />;
                          }
                          return (
                            <td key={d} className={`border border-gray-200 px-0.5 py-0.5 ${bgClass}`}>
                              <div className="flex flex-col gap-px items-center">
                                {items.map((item, ii) => (
                                  <div key={ii}
                                    className="w-full text-center rounded text-white font-medium px-0.5"
                                    style={{ background: item.leaveTypeColor || "#3b82f6", fontSize:"9px", lineHeight:"14px" }}
                                    title={item.leaveTypeName}>
                                    {renderMergedAbbr(item)}
                                  </div>
                                ))}
                              </div>
                            </td>
                          );
                        })}
                        <td className="border border-gray-200 px-2 py-1 text-center font-semibold text-blue-700">
                          {monthUsed > 0 ? monthUsed : ""}
                        </td>
                      </tr>
                    );
                  })
                ))}
                {/* 합계 행 */}
                <tr className="bg-[#f0f4fa] font-semibold">
                  <td className="sticky left-0 z-10 bg-[#f0f4fa] border border-gray-300 px-2 py-1.5 text-center text-gray-700" colSpan={3}>합계</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center text-gray-700">
                    {employees.reduce((s,e)=>s+(empTotalMap.get(e.id)??0),0)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center text-blue-700">
                    {employees.reduce((s,e)=>s+(empUsedMap.get(e.id)??0),0)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center text-green-700">-</td>
                  {dayHeaders.map(({ d }) => (
                    <td key={d} className="border border-gray-300 px-0 py-1.5 text-center text-blue-700 text-[9px]">
                      {dayTotals[d-1] > 0 ? dayTotals[d-1] : ""}
                    </td>
                  ))}
                  <td className="border border-gray-300 px-2 py-1.5 text-center text-blue-700">
                    {dayTotals.reduce((s,v)=>s+v,0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 범례 */}
          <div className="flex flex-wrap gap-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg p-3">
            <span className="font-medium text-gray-700 mr-1">범례:</span>
            {leaveTypes.filter((lt)=>usedTypeCodes.has(lt.code)).map((lt) => (
              <span key={lt.code} className="flex items-center gap-1">
                <span className="inline-block w-5 h-4 rounded text-white text-center font-bold"
                  style={{background:lt.color,fontSize:"8px",lineHeight:"16px"}}>
                  {ABBR[lt.code]??lt.name.slice(0,2)}
                </span>
                {lt.name}
              </span>
            ))}
            <span className="flex items-center gap-1 ml-2"><span className="w-4 h-4 bg-red-50 border border-red-200 rounded"/><span>일(공)</span></span>
            <span className="flex items-center gap-1"><span className="w-4 h-4 bg-blue-50 border border-blue-200 rounded"/><span>토</span></span>
          </div>
        </>
      ) : (
        /* ══ 귀속연도별 월별 사용 현황 (엑셀 시트1 스타일) ══ */
        <>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 flex items-center gap-3 text-sm">
            <span className="font-bold text-gray-800">귀속연도: {fy}년 ({fy}/5/1 ~ {fy+1}/4/30)</span>
            <span className="text-gray-400">|</span>
            <span className="text-gray-500">기준일: {formatYMD(new Date())}</span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
            <table className="border-collapse text-xs attendance-table-mobile" style={{ minWidth:"max-content" }}>
              <thead>
                <tr className="bg-[#1e3a5f] text-white">
                  <th className="sticky left-0 z-20 bg-[#1e3a5f] border border-[#2a4a70] px-2 py-2 text-left whitespace-nowrap min-w-[60px]">팀</th>
                  <th className="sticky left-[60px] z-20 bg-[#1e3a5f] border border-[#2a4a70] px-2 py-2 text-left whitespace-nowrap min-w-[56px]">성명</th>
                  <th className="sticky left-[116px] z-20 bg-[#1e3a5f] border border-[#2a4a70] px-2 py-2 text-left whitespace-nowrap min-w-[52px]">직급</th>
                  <th className="bg-[#1e3a5f] border border-[#2a4a70] px-2 py-2 text-center whitespace-nowrap">입사일</th>
                  <th className="bg-[#345d87] border border-[#2a4a70] px-2 py-2 text-center whitespace-nowrap">부여일수</th>
                  <th className="bg-[#345d87] border border-[#2a4a70] px-2 py-2 text-center whitespace-nowrap">사용일수</th>
                  <th className="bg-[#345d87] border border-[#2a4a70] px-2 py-2 text-center whitespace-nowrap">잔여일수</th>
                  {MONTH_LABELS.map((ml) => (
                    <th key={ml} className="bg-[#2a4a70] border border-[#3a5a80] px-2 py-2 text-center whitespace-nowrap min-w-[36px]">{ml}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(grouped.entries()).map(([teamName, emps]) => (
                  emps.map((emp, ei) => {
                    const monthly = empMonthlyMap.get(emp.id) ?? Array(12).fill(0);
                    const totalGranted = empTotalMap.get(emp.id) ?? 0;
                    const totalUsed   = empUsedMap.get(emp.id) ?? 0;
                    const hireStr = emp.hireDate ? formatYMD(emp.hireDate) : "-";
                    return (
                      <tr key={emp.id} className={ei%2===0?"bg-white":"bg-gray-50"}>
                        {ei === 0 ? (
                          <td className="sticky left-0 z-10 bg-inherit border border-gray-200 px-2 py-1 text-center font-medium text-gray-700 whitespace-nowrap"
                            rowSpan={emps.length} style={{verticalAlign:"middle"}}>
                            {teamName}
                          </td>
                        ) : null}
                        <td className="sticky left-[60px] z-10 bg-inherit border border-gray-200 px-2 py-1 font-medium text-gray-800 whitespace-nowrap">{emp.name}</td>
                        <td className="sticky left-[116px] z-10 bg-inherit border border-gray-200 px-2 py-1 text-gray-600 whitespace-nowrap">{emp.position}</td>
                        <td className="border border-gray-200 px-2 py-1 text-center text-gray-500 whitespace-nowrap">{hireStr}</td>
                        <td className="border border-gray-200 px-2 py-1 text-center font-medium text-gray-800">{totalGranted}</td>
                        <td className="border border-gray-200 px-2 py-1 text-center font-medium text-blue-600">{totalUsed}</td>
                        <td className="border border-gray-200 px-2 py-1 text-center font-medium text-green-600">{Math.max(0,totalGranted-totalUsed)}</td>
                        {monthly.map((d, mi) => (
                          <td key={mi} className={`border border-gray-200 px-1 py-1 text-center ${d>0?"text-blue-700 font-medium bg-blue-50":""}`}>
                            {d > 0 ? d : ""}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                ))}
                {/* 합계 */}
                <tr className="bg-[#f0f4fa] font-semibold">
                  <td className="sticky left-0 z-10 bg-[#f0f4fa] border border-gray-300 px-2 py-1.5 text-center text-gray-700" colSpan={3}>합계</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center">-</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center text-gray-700">
                    {employees.reduce((s,e)=>s+(empTotalMap.get(e.id)??0),0)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center text-blue-700">
                    {employees.reduce((s,e)=>s+(empUsedMap.get(e.id)??0),0)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center text-green-700">-</td>
                  {MONTH_LABELS.map((_, mi) => {
                    const sum = employees.reduce((s,e)=>{
                      const m = empMonthlyMap.get(e.id);
                      return s + (m?.[mi] ?? 0);
                    }, 0);
                    return (
                      <td key={mi} className={`border border-gray-300 px-1 py-1.5 text-center ${sum>0?"text-blue-700 font-semibold":""}`}>
                        {sum > 0 ? sum : ""}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
