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

type StampCardApi = {
  id: string;
  displayIndex: number;
  sortOrder: number;
  filledCount: number;
  stampCount: number;
  healingUsed: boolean;
  afternoonUsed: boolean;
};

export default function StampGrantTab({ rows }: { rows: StampGrantRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});

  const [healModalEmp, setHealModalEmp] = useState<{ id: string; label: string } | null>(null);
  const [healCards, setHealCards] = useState<StampCardApi[]>([]);
  const [healLoad, setHealLoad] = useState(false);
  const [healErr, setHealErr] = useState<string | null>(null);
  const [healMarkingId, setHealMarkingId] = useState<string | null>(null);

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

  function closeHealModal() {
    setHealModalEmp(null);
    setHealCards([]);
    setHealErr(null);
    setHealLoad(false);
    setHealMarkingId(null);
  }

  async function openHealModal(empId: string, label: string) {
    setHealModalEmp({ id: empId, label });
    setHealErr(null);
    setHealCards([]);
    setHealLoad(true);
    try {
      const res = await fetch(`/api/admin/employee-stamp-cards?employeeId=${encodeURIComponent(empId)}`, {
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as { cards?: StampCardApi[]; error?: string };
      if (!res.ok) {
        setHealErr(typeof data.error === "string" ? data.error : "장 목록을 불러오지 못했습니다.");
        return;
      }
      setHealCards(Array.isArray(data.cards) ? data.cards : []);
    } catch {
      setHealErr("네트워크 오류로 장 목록을 불러오지 못했습니다.");
    } finally {
      setHealLoad(false);
    }
  }

  async function markHealingUsed(stampCardId: string) {
    if (!confirm("이 장의 힐링 권한만 소모 처리합니다. (휴가 신청 없음) 계속할까요?")) return;
    setHealMarkingId(stampCardId);
    setHealErr(null);
    try {
      const res = await fetch("/api/admin/stamp-card/mark-healing-used", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stampCardId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok !== true) {
        setHealErr(typeof data.error === "string" ? data.error : "처리에 실패했습니다.");
        return;
      }
      closeHealModal();
      await router.refresh();
    } catch {
      setHealErr("네트워크 오류로 처리하지 못했습니다.");
    } finally {
      setHealMarkingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 space-y-1.5 max-w-3xl">
        <p>
          스탬프는 <strong>휴가 할당(유효기간)</strong>과 별도로 관리됩니다. 이전 시스템에서 이관·초기 세팅 시 칸 수를
          모를 때는 여기서 칸을 맞추고, <strong>실제로는 힐링을 썼는데 DB에만 안 남은 경우</strong>는 「힐링 소모」로
          장별 힐링 권한만 맞출 수 있습니다.
        </p>
        <p className="text-xs text-amber-900/85">
          부여한 칸은 장(10칸)에 쌓이며, 5칸·10칸 단위로 힐링데이·오후 인정 권한이 열립니다. 한 번에 최대 30칸까지
          부여할 수 있습니다. 「힐링 가능 장」은 해당 장에서 힐링을 <strong>아직 쓰지 않은</strong> 경우만 셉니다.
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
              <th className="whitespace-nowrap text-xs">힐링 소모</th>
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
                <td>
                  <button
                    type="button"
                    className="btn-outline btn-sm px-2.5 text-xs whitespace-nowrap"
                    disabled={loadingId === r.id}
                    onClick={() => openHealModal(r.id, `${r.name} (${r.empNo})`)}
                  >
                    장 선택…
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {healModalEmp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="heal-modal-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeHealModal();
          }}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-2">
              <div>
                <h2 id="heal-modal-title" className="text-sm font-semibold text-gray-900">
                  힐링 권한 수동 소모
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">{healModalEmp.label}</p>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1"
                onClick={closeHealModal}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="px-4 py-3 overflow-y-auto text-sm space-y-2">
              {healLoad && <p className="text-gray-500">불러오는 중…</p>}
              {healErr && <p className="text-red-600 text-xs">{healErr}</p>}
              {!healLoad && !healErr && healCards.length === 0 && (
                <p className="text-gray-500 text-xs">등록된 스탬프 장이 없습니다.</p>
              )}
              {!healLoad &&
                healCards.map((c) => {
                  const canMark = c.stampCount >= 5 && !c.healingUsed;
                  return (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800">
                          장 {c.displayIndex}
                          <span className="text-gray-500 font-normal text-xs ml-1.5">
                            실제 칸 {c.stampCount} · 표시 {c.filledCount}/10
                          </span>
                        </p>
                        <p className="text-[11px] text-gray-500">
                          힐링 {c.healingUsed ? "소모됨" : "미소모"}
                          {" · "}오후인정 {c.afternoonUsed ? "소모됨" : "미소모"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn-sm px-2.5 shrink-0 bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-40"
                        disabled={!canMark || healMarkingId !== null}
                        onClick={() => markHealingUsed(c.id)}
                        title={
                          c.stampCount < 5
                            ? "5칸 이상인 장만 가능"
                            : c.healingUsed
                              ? "이미 소모됨"
                              : "힐링만 소모"
                        }
                      >
                        {healMarkingId === c.id ? "처리 중…" : "힐링만 소모"}
                      </button>
                    </div>
                  );
                })}
            </div>
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
              <p className="text-[11px] text-gray-500 leading-snug">
                오후 인정은 여기서 다루지 않습니다. 휴가 신청·결재 흐름 또는 별도 정합이 필요하면 말씀 주세요.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
