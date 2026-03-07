"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface EmpBalance {
  id: string;
  name: string;
  balance: { totalDays: number; usedDays: number; carryoverDays: number; specialDays: number } | null;
}

export default function CarryoverForm({
  employees, currentFy,
}: {
  employees: EmpBalance[];
  currentFy: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function setDays(id: string, val: string) {
    setRows((prev) => ({ ...prev, [id]: val }));
  }

  async function handleSubmit() {
    const items = Object.entries(rows)
      .filter(([, v]) => v !== "" && !isNaN(parseFloat(v)))
      .map(([employeeId, days]) => ({ employeeId, days: parseFloat(days) }));

    if (items.length === 0) { alert("이월할 직원과 일수를 입력하세요."); return; }
    if (!confirm(`${items.length}명에 대해 ${currentFy + 1}년 귀속연도로 이월 처리하시겠습니까?`)) return;

    setLoading(true);
    const res = await fetch("/api/admin/carryover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentFy, items }),
    });
    setLoading(false);
    if (res.ok) { setRows({}); router.refresh(); alert("이월 처리 완료"); }
    else { const d = await res.json(); alert(d.error ?? "오류 발생"); }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>이름</th>
              <th>현재 잔여</th>
              <th>이월 일수 입력</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const bal = emp.balance;
              const remaining = bal
                ? bal.totalDays + bal.carryoverDays + bal.specialDays - bal.usedDays
                : 0;
              return (
                <tr key={emp.id}>
                  <td>{emp.name}</td>
                  <td className="font-medium">{remaining.toFixed(1)}일</td>
                  <td>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max={remaining}
                      className="input w-24"
                      placeholder="0"
                      value={rows[emp.id] ?? ""}
                      onChange={(e) => setDays(emp.id, e.target.value)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button onClick={handleSubmit} className="btn-primary" disabled={loading}>
        {loading ? <span className="spinner" /> : `${currentFy + 1}년으로 이월 처리`}
      </button>
    </div>
  );
}
