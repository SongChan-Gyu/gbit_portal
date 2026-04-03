"use client";
import { useState } from "react";
import { signIn, useSession } from "next-auth/react";

interface Emp {
  id: string; name: string; empNo: string; position: string; role: string;
  team: { name: string } | null;
  user: { username: string } | null;
}

const ROLE_BADGE: Record<string, string> = {
  STAFF:"bg-gray-100 text-gray-600",
  TEAM_LEAD:"bg-blue-100 text-blue-700",
  PM:"bg-purple-100 text-purple-700",
  ADMIN:"bg-red-100 text-red-700",
};
const ROLE_LABEL: Record<string, string> = {
  STAFF:"팀원", TEAM_LEAD:"팀장", PM:"PM", ADMIN:"관리자",
};

export default function UserSwitchClient({ employees }: { employees: Emp[] }) {
  const { data: session } = useSession();
  const [switching, setSwitching] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const filtered = filter
    ? employees.filter((e) => e.name.includes(filter) || e.team?.name?.includes(filter) || e.role.includes(filter))
    : employees;

  async function handleSwitch(emp: Emp) {
    if (!emp.user) { alert("계정이 없는 사원입니다."); return; }
    setSwitching(emp.id);

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

  return (
    <div className="space-y-4">
      <div className="card">
        <input className="input" placeholder="이름·팀·역할 검색" value={filter}
          onChange={(e) => setFilter(e.target.value)} />
      </div>

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
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white font-bold flex items-center justify-center text-sm shrink-0">
                {emp.name.charAt(0)}
              </div>
            </div>

            <button
              onClick={() => handleSwitch(emp)}
              disabled={switching === emp.id || !emp.user}
              className={`btn-primary w-full text-xs py-2 ${!emp.user ? "opacity-40 cursor-not-allowed" : ""}`}>
              {switching === emp.id ? (
                <><span className="spinner" /><span>전환 중…</span></>
              ) : "→ 이 계정으로 전환"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
