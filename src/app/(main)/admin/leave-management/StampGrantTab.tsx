"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type StampGrantRow = {
  id: string;
  name: string;
  empNo: string;
  teamName: string | null;
  stampCouponCount: number;
  healingEligibleCards: number;
  afternoonEligibleCards: number;
};

export default function StampGrantTab({ rows }: { rows: StampGrantRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        r.empNo.toLowerCase().includes(s) ||
        (r.teamName && r.teamName.toLowerCase().includes(s)),
    );
  }, [rows, q]);

  async function grant(employeeId: string) {
    const raw = counts[employeeId] ?? "1";
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) {
      alert("부여할 칸 수는 1 이상의 정수로 입력해 주세요.");
      return;
    }
    setLoadingId(employeeId);
    try {
      const res = await fetch("/api/admin/stamp-grant", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, count: n }),
      });
      const ct = res.headers.get("content-type") ?? "";
      let data: { ok?: boolean; error?: string } = {};
      if (ct.includes("application/json")) {
        try {
          data = (await res.json()) as { ok?: boolean; error?: string };
        } catch {
          data = {};
        }
      }
      /** 로그인 페이지 HTML 등 JSON이 아니면 ok 없음 → 실패 처리 */
      if (!res.ok || data.ok !== true) {
        const msg =
          typeof data.error === "string"
            ? data.error
            : !res.ok
              ? "부여에 실패했습니다. 로그인·권한을 확인해 주세요."
              : "응답을 확인할 수 없습니다. 새로고침 후 다시 시도해 주세요.";
        alert(msg);
        return;
      }
      setCounts((prev) => ({ ...prev, [employeeId]: "1" }));
      await router.refresh();
    } catch (e) {
      console.error("[stamp-grant]", e);
      alert("네트워크 오류로 결과를 확인하지 못했습니다.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 space-y-1.5 max-w-3xl">
        <p>
          스탬프는 <strong>휴가 할당(유효기간)</strong>과 별도로 관리됩니다. 팀장 승인 없이 칸을 채워야 할 때
          관리자·PM이 여기서 수동으로 부여합니다.
        </p>
        <p className="text-xs text-amber-900/85">
          부여한 칸은 기존과 동일하게 장(10칸)에 쌓이며, 5칸·10칸 단위로 힐링데이·오후 인정 권한이 열립니다.
          한 번에 최대 30칸까지 부여할 수 있습니다.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-gray-600 shrink-0">검색</label>
        <input
          type="search"
          className="input max-w-xs text-sm"
          placeholder="이름, 사번, 팀"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="text-xs text-gray-400">{filtered.length}명 표시</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="data-table">
          <thead>
            <tr>
              <th className="whitespace-nowrap">직원</th>
              <th className="whitespace-nowrap">팀</th>
              <th className="whitespace-nowrap tabular-nums" title="누적 StampCoupon 행 수">
                누적 칸
              </th>
              <th className="whitespace-nowrap tabular-nums text-xs" title="5칸 이상·힐링 미사용 장 수">
                힐링 가능 장
              </th>
              <th className="whitespace-nowrap tabular-nums text-xs" title="10칸·오후인정 미사용 장 수">
                오후인정 가능 장
              </th>
              <th className="whitespace-nowrap">수동 부여</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="font-medium whitespace-nowrap">
                  {r.name}
                  <span className="text-gray-400 font-normal text-xs ml-1.5">{r.empNo}</span>
                </td>
                <td className="whitespace-nowrap text-gray-600">{r.teamName ?? "—"}</td>
                <td className="tabular-nums font-semibold text-amber-800">{r.stampCouponCount}</td>
                <td className="tabular-nums text-gray-700">{r.healingEligibleCards}</td>
                <td className="tabular-nums text-gray-700">{r.afternoonEligibleCards}</td>
                <td>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={30}
                      className="input w-20 text-sm tabular-nums py-1.5"
                      value={counts[r.id] ?? "1"}
                      onChange={(e) => setCounts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      disabled={loadingId === r.id}
                    />
                    <span className="text-xs text-gray-500">칸</span>
                    <button
                      type="button"
                      className="btn-primary btn-sm px-3"
                      disabled={loadingId === r.id}
                      onClick={() => grant(r.id)}
                    >
                      {loadingId === r.id ? "처리 중…" : "부여"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
