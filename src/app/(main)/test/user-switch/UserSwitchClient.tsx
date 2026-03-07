"use client";
import { useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { todayStr } from "@/lib/workdays";

interface Emp {
  id: string; name: string; empNo: string; position: string; role: string;
  team: { name: string } | null;
  user: { username: string } | null;
}
interface LT { id: string; code: string; name: string; color: string; isHalf: boolean; }

const ROLE_BADGE: Record<string, string> = {
  STAFF:"bg-gray-100 text-gray-600",
  TEAM_LEAD:"bg-blue-100 text-blue-700",
  PM:"bg-purple-100 text-purple-700",
  ADMIN:"bg-red-100 text-red-700",
};
const ROLE_LABEL: Record<string, string> = {
  STAFF:"팀원", TEAM_LEAD:"팀장", PM:"PM", ADMIN:"관리자",
};

export default function UserSwitchClient({ employees, leaveTypes }: { employees: Emp[]; leaveTypes: LT[] }) {
  const { data: session } = useSession();
  const [switching, setSwitching] = useState<string | null>(null);
  const [quickLeave, setQuickLeave] = useState<{ empId: string; empName: string } | null>(null);
  const [qlForm, setQlForm] = useState({ leaveTypeCode: "ANNUAL", startDate: todayStr(), endDate: todayStr(), reason: "(테스트)" });
  const [qlLoading, setQlLoading] = useState(false);
  const [qlResult, setQlResult] = useState("");
  const [filter, setFilter] = useState("");

  const filtered = filter
    ? employees.filter((e) => e.name.includes(filter) || e.team?.name?.includes(filter) || e.role.includes(filter))
    : employees;

  async function handleSwitch(emp: Emp) {
    if (!emp.user) { alert("계정이 없는 사원입니다."); return; }
    setSwitching(emp.id);

    // 1) 현재 계정(관리자)의 bypass 토큰을 미리 발급받아 저장
    //    → 전환 후에는 권한이 없어 API 호출 불가하므로 미리 확보
    const su = session?.user as any;
    if (su?.employeeId && su?.name) {
      const myTokenRes = await fetch("/api/test/bypass-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: su.employeeId }),
      });
      if (myTokenRes.ok) {
        const { token: myToken } = await myTokenRes.json();
        localStorage.setItem(
          "hrm_switched_from",
          JSON.stringify({ empId: su.employeeId, name: su.name, token: myToken })
        );
      }
    }

    // 2) 대상 계정으로 전환
    const res = await fetch("/api/test/bypass-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: emp.id }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error ?? "토큰 발급 실패"); setSwitching(null); return; }
    const result = await signIn("credentials", {
      bypassToken: data.token, redirect: false,
    });
    setSwitching(null);
    if (result?.error) { alert("로그인 실패: " + result.error); return; }
    window.location.href = "/dashboard";
  }

  async function createQuickLeave() {
    if (!quickLeave) return;
    setQlLoading(true); setQlResult("");
    const res = await fetch("/api/test/quick-leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: quickLeave.empId, ...qlForm }),
    });
    const data = await res.json();
    setQlLoading(false);
    if (!res.ok) { setQlResult("❌ " + (data.error ?? "실패")); return; }
    setQlResult("✅ 휴가 신청 생성 완료 (ID: " + data.id + ")");
  }

  return (
    <div className="space-y-4">
      {/* 검색 */}
      <div className="card">
        <input className="input" placeholder="이름·팀·역할 검색" value={filter}
          onChange={(e) => setFilter(e.target.value)} />
      </div>

      {/* 사용자 목록 */}
      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((emp) => (
          <div key={emp.id} className="card hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-gray-800">{emp.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ROLE_BADGE[emp.role]}`}>
                    {ROLE_LABEL[emp.role]}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{emp.team?.name ?? "-"} · {emp.position}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {emp.user ? `@${emp.user.username}` : <span className="text-red-400">계정 없음</span>}
                </p>
              </div>
              {/* 사용자 아바타 */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white font-bold flex items-center justify-center text-sm shrink-0">
                {emp.name.charAt(0)}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleSwitch(emp)}
                disabled={switching === emp.id || !emp.user}
                className={`btn-primary flex-1 text-xs py-2 ${!emp.user ? "opacity-40 cursor-not-allowed" : ""}`}>
                {switching === emp.id ? (
                  <><span className="spinner" /><span>전환 중…</span></>
                ) : "→ 이 계정으로 전환"}
              </button>
              <button
                onClick={() => { setQuickLeave({ empId: emp.id, empName: emp.name }); setQlResult(""); }}
                className="btn-secondary text-xs py-2 px-3"
                title="빠른 휴가 신청 생성">
                📝
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 빠른 휴가 신청 생성 모달 */}
      {quickLeave && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">📝 빠른 휴가 신청 생성</h2>
              <button onClick={() => setQuickLeave(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <p className="text-sm text-blue-600 font-medium mb-4">
              신청자: {quickLeave.empName}
            </p>

            <div className="space-y-3">
              <div>
                <label className="label">휴가 유형</label>
                <select className="input" value={qlForm.leaveTypeCode}
                  onChange={(e) => setQlForm((p) => ({ ...p, leaveTypeCode: e.target.value }))}>
                  {leaveTypes.map((lt) => (
                    <option key={lt.id} value={lt.code}>{lt.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">시작일</label>
                  <input type="date" className="input" value={qlForm.startDate}
                    onChange={(e) => setQlForm((p) => ({ ...p, startDate: e.target.value }))} />
                </div>
                <div>
                  <label className="label">종료일</label>
                  <input type="date" className="input" value={qlForm.endDate}
                    min={qlForm.startDate}
                    onChange={(e) => setQlForm((p) => ({ ...p, endDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">사유</label>
                <input className="input" value={qlForm.reason}
                  onChange={(e) => setQlForm((p) => ({ ...p, reason: e.target.value }))} />
              </div>
            </div>

            {qlResult && (
              <p className={`text-sm mt-3 p-2 rounded-lg ${qlResult.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                {qlResult}
              </p>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={() => setQuickLeave(null)} className="btn-secondary flex-1 text-sm">닫기</button>
              <button onClick={createQuickLeave} disabled={qlLoading} className="btn-primary flex-1 text-sm">
                {qlLoading ? "생성 중…" : "신청 생성"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
