"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatYMD, formatMDWithDay } from "@/lib/dateUtils";

type LeaveRequestRow = {
  id: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: string;
  createdAt: string;
  employee: { id: string; name: string; empNo: string; team: { name: string } | null };
  items: { leaveType: { code: string; name: string } }[];
};

type Employee = { id: string; name: string; empNo: string };
type LeaveType = { id: string; code: string; name: string };

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "반려",
  CANCELLED: "취소",
};
const STATUS_CLS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-600",
};

function getFiscalYear(): number {
  const d = new Date();
  const m = d.getMonth();
  return m >= 4 ? d.getFullYear() : d.getFullYear() - 1;
}

function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d.setDate(diff));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getMonthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export default function LeaveApprovalsTab({
  employees,
  leaveTypes,
  initialFy,
}: {
  employees: Employee[];
  leaveTypes: LeaveType[];
  initialFy: number;
}) {
  const router = useRouter();
  const [empId, setEmpId] = useState("");
  const [fy, setFy] = useState(initialFy);
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [list, setList] = useState<LeaveRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamView, setTeamView] = useState<"week" | "month">("month");
  const [teamMonth, setTeamMonth] = useState(new Date().getMonth() + 1);
  const [teamYear, setTeamYear] = useState(new Date().getFullYear());
  const [teamList, setTeamList] = useState<LeaveRequestRow[]>([]);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (empId) params.set("empId", empId);
    if (fy) params.set("fy", String(fy));
    if (leaveTypeId) params.set("leaveTypeId", leaveTypeId);
    const res = await fetch(`/api/admin/leave-requests?${params}`);
    if (res.ok) setList(await res.json());
    setLoading(false);
  }, [empId, fy, leaveTypeId]);

  const fetchTeamList = useCallback(async () => {
    let start: Date, end: Date;
    if (teamView === "week") {
      const ref = new Date(teamYear, teamMonth - 1, 15);
      const range = getWeekRange(ref);
      start = range.start;
      end = range.end;
    } else {
      const range = getMonthRange(teamYear, teamMonth);
      start = range.start;
      end = range.end;
    }
    const params = new URLSearchParams({
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    });
    const res = await fetch(`/api/admin/leave-requests?${params}`);
    if (res.ok) setTeamList(await res.json());
  }, [teamView, teamYear, teamMonth]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetchTeamList();
  }, [fetchTeamList]);

  async function cancelRequest(id: string) {
    if (!confirm("이 휴가 신청을 직권 취소하시겠습니까?")) return;
    setCancelling(id);
    const res = await fetch(`/api/leave/request/${id}/admin-cancel`, { method: "POST" });
    setCancelling(null);
    if (res.ok) {
      fetchList();
      fetchTeamList();
      router.refresh();
    } else {
      const data = await res.json();
      alert(data.error || "취소 실패");
    }
  }

  const prevMonth = () => {
    if (teamMonth === 1) {
      setTeamYear((y) => y - 1);
      setTeamMonth(12);
    } else setTeamMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (teamMonth === 12) {
      setTeamYear((y) => y + 1);
      setTeamMonth(1);
    } else setTeamMonth((m) => m + 1);
  };

  const monthLabel = (y: number, m: number) => `${y}년 ${m}월`;
  const threeMonths = (() => {
    let prevM = teamMonth - 1, prevY = teamYear;
    if (prevM < 1) {
      prevM = 12;
      prevY = teamYear - 1;
    }
    let nextM = teamMonth + 1, nextY = teamYear;
    if (nextM > 12) {
      nextM = 1;
      nextY = teamYear + 1;
    }
    return [
      { label: "전달", y: prevY, m: prevM },
      { label: "이번 달", y: teamYear, m: teamMonth },
      { label: "다음 달", y: nextY, m: nextM },
    ];
  })();

  return (
    <div className="space-y-8">
      {/* 필터 + 전체 결재 목록 */}
      <div>
        <h3 className="text-base font-semibold text-gray-800 mb-3">전체 결재 내역</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          <select
            value={empId}
            onChange={(e) => setEmpId(e.target.value)}
            className="input text-sm py-2 rounded-lg border-gray-200 min-w-0 max-w-[180px]"
          >
            <option value="">전체 사원</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name} ({e.empNo})</option>
            ))}
          </select>
          <select
            value={fy}
            onChange={(e) => setFy(parseInt(e.target.value, 10))}
            className="input text-sm py-2 rounded-lg border-gray-200 w-auto"
          >
            {[getFiscalYear() - 1, getFiscalYear(), getFiscalYear() + 1].map((y) => (
              <option key={y} value={y}>{y} 귀속연도</option>
            ))}
          </select>
          <select
            value={leaveTypeId}
            onChange={(e) => setLeaveTypeId(e.target.value)}
            className="input text-sm py-2 rounded-lg border-gray-200 min-w-0 max-w-[160px]"
          >
            <option value="">전체 유형</option>
            {leaveTypes.map((lt) => (
              <option key={lt.id} value={lt.id}>{lt.name}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 py-6">로딩 중...</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 -mx-2 sm:mx-0">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 text-left font-medium text-gray-600">직원</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-600">기간</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-600">유형</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-600">일수</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-600">상태</th>
                  <th className="px-3 py-2.5 text-right font-medium text-gray-600">액션</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-500">내역이 없습니다.</td></tr>
                ) : (
                  list.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-gray-800">{r.employee.name}</span>
                        <span className="text-gray-500 text-xs ml-1">{r.employee.empNo}</span>
                        {r.employee.team && (
                          <span className="text-gray-400 text-xs ml-1">· {r.employee.team.name}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">
                        {r.startDate === r.endDate
                          ? formatYMD(r.startDate)
                          : `${formatYMD(r.startDate)} ~ ${formatYMD(r.endDate)}`}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">
                        {r.items.map((i) => i.leaveType.name).join(", ")}
                      </td>
                      <td className="px-3 py-2.5 font-medium">{r.totalDays}일</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLS[r.status] ?? "bg-gray-100"}`}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {r.status !== "CANCELLED" && r.status !== "REJECTED" && (
                          <button
                            type="button"
                            onClick={() => cancelRequest(r.id)}
                            disabled={cancelling === r.id}
                            className="text-sm text-rose-600 hover:text-rose-800 font-medium disabled:opacity-50"
                          >
                            {cancelling === r.id ? "처리 중..." : "취소"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 팀원 휴가 주간/월별 */}
      <div>
        <h3 className="text-base font-semibold text-gray-800 mb-3">팀원 휴가 (승인된 건)</h3>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
            <button
              type="button"
              onClick={() => setTeamView("week")}
              className={`px-3 py-1.5 text-sm rounded-md ${teamView === "week" ? "bg-white shadow text-gray-800" : "text-gray-600"}`}
            >
              주간
            </button>
            <button
              type="button"
              onClick={() => setTeamView("month")}
              className={`px-3 py-1.5 text-sm rounded-md ${teamView === "month" ? "bg-white shadow text-gray-800" : "text-gray-600"}`}
            >
              월별
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100">
              ←
            </button>
            <span className="font-medium text-gray-800 min-w-[100px] text-center">
              {teamView === "month" ? monthLabel(teamYear, teamMonth) : `${monthLabel(teamYear, teamMonth)} 주간`}
            </span>
            <button type="button" onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100">
              →
            </button>
          </div>
        </div>

        {teamView === "month" ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {threeMonths.map(({ label, y, m }) => {
              const range = getMonthRange(y, m);
              const startStr = range.start.toISOString().slice(0, 10);
              const endStr = range.end.toISOString().slice(0, 10);
              const inRange = teamList.filter((r) => {
                const s = r.startDate.slice(0, 10);
                const e = r.endDate.slice(0, 10);
                return e >= startStr && s <= endStr;
              });
              return (
                <div key={`${y}-${m}`} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">{label} ({y}년 {m}월)</h4>
                  <ul className="space-y-2">
                    {inRange.length === 0 ? (
                      <li className="text-sm text-gray-500">휴가 없음</li>
                    ) : (
                      inRange.map((r) => (
                        <li key={r.id} className="text-sm flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="font-medium text-gray-800">{r.employee.name}</span>
                          <span className="text-gray-500">
                            {r.startDate === r.endDate
                              ? formatYMD(r.startDate)
                              : `${formatMDWithDay(r.startDate)}~${formatMDWithDay(r.endDate)}`}
                          </span>
                          <span className="text-gray-500">({r.items.map((i) => i.leaveType.name).join(", ")})</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500 mb-2">
              {monthLabel(teamYear, teamMonth)} 기준 해당 주
            </p>
            <ul className="space-y-2">
              {teamList.length === 0 ? (
                <li className="text-sm text-gray-500">휴가 없음</li>
              ) : (
                teamList.map((r) => (
                  <li key={r.id} className="text-sm flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-medium text-gray-800">{r.employee.name}</span>
                    <span className="text-gray-500">
                      {r.startDate === r.endDate
                        ? formatYMD(r.startDate)
                        : `${formatMDWithDay(r.startDate)}~${formatMDWithDay(r.endDate)}`}
                    </span>
                    <span className="text-gray-500">({r.items.map((i) => i.leaveType.name).join(", ")})</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
