"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import { todayStr } from "@/lib/workdays";
import { formatYMD, formatMDWithDay } from "@/lib/dateUtils";

interface Stamp { id: string; stampDate: string; isUsed: boolean; usedForType: string | null; usedAt: string | null; }
interface SR { id: string; stampDate: string; description: string; status: string; approvedAt: string | null; comment: string | null; }
interface HLog { id: string; startDate: string; }
interface Emp { id: string; name: string; team: { name: string } | null; position: string; }

const SR_STATUS: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  PENDING:  { label: "대기",   icon: <Clock size={12}/>,         cls: "badge-warning" },
  APPROVED: { label: "승인",   icon: <CheckCircle2 size={12}/>,  cls: "badge-success" },
  REJECTED: { label: "반려",   icon: <XCircle size={12}/>,       cls: "badge-danger" },
};

export default function StampClient({
  stamps, stampRequests, employee, healingLogs, employeeId,
}: {
  stamps: Stamp[]; stampRequests: SR[]; employee: Emp | null;
  healingLogs: HLog[]; employeeId: string;
}) {
  const router = useRouter();
  const avail  = stamps.filter((s) => !s.isUsed);
  const count  = avail.length;
  const healingUsable = Math.floor(count / 5);   // 힐링데이 5개당 1회
  const afternoonUsable = Math.floor(count / 10); // 오후 인정 10개당 1회
  const MAX_SLOTS = 30; // UI에 표시할 최대 칸 수 (그 이상은 "외 N개"로)

  // 스탬프 요청 폼
  const [reqForm, setReqForm] = useState({ stampDate: todayStr(), description: "" });
  const [reqLoading, setReqLoading] = useState(false);
  const [reqMsg, setReqMsg] = useState("");

  // 힐링데이 폼
  const [hdDate, setHdDate] = useState(todayStr());
  const [hdLoading, setHdLoading] = useState(false);
  const [hdMsg, setHdMsg] = useState("");

  async function submitStampReq() {
    if (!reqForm.description.trim()) { setReqMsg("반영 내용을 입력하세요."); return; }
    setReqLoading(true); setReqMsg("");
    const res = await fetch("/api/stamp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqForm),
    });
    const data = await res.json();
    setReqLoading(false);
    if (!res.ok) { setReqMsg(data.error ?? "요청 실패"); return; }
    setReqMsg("✓ 스탬프 요청이 접수되었습니다.");
    setReqForm({ stampDate: todayStr(), description: "" });
    router.refresh();
  }

  async function applyHealingDay() {
    setHdLoading(true); setHdMsg("");
    const res = await fetch("/api/leave/healing-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: hdDate }),
    });
    const data = await res.json();
    setHdLoading(false);
    if (!res.ok) { setHdMsg(data.error ?? "신청 실패"); return; }
    setHdMsg("✓ 힐링데이 이력이 등록되었습니다.");
    router.refresh();
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">스탬프 쿠폰</h1>
          <p className="page-subtitle">{employee?.name} · {employee?.team?.name} · {employee?.position}</p>
        </div>
      </div>

      {/* 스탬프 현황 패널 — 누적 개수, 사용 가능 횟수 */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">스탬프 현황</span>
          <span className="text-sm font-bold text-amber-600">
            보유 <span className="text-lg">{count}</span>개
          </span>
        </div>
        <div className="panel-body">
          <p className="text-xs text-gray-500 mb-3">
            스탬프는 계속 누적됩니다. 5개당 힐링데이 1회, 10개당 오후 인정휴가 1회 사용 가능합니다. 예: 20개 보유 시 힐링데이 2회 + 오후 인정 2회 사용 가능.
          </p>
          {/* 스탬프 쿠폰 (★ 채운 칸 / ☆ 빈 칸) */}
          <div className="flex items-center gap-1.5 flex-wrap mb-4">
            {Array.from({ length: Math.min(Math.max(count, 10), MAX_SLOTS) }).map((_, i) => {
              const filled = i < count;
              const s = avail[i];
              return (
                <span
                  key={i}
                  title={s ? formatYMD(s.stampDate) : filled ? "스탬프 보유" : "미적립"}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    filled ? "bg-amber-400 text-white" : "bg-gray-200 text-gray-300"
                  }`}
                >
                  {filled ? "★" : "☆"}
                </span>
              );
            })}
            {count > MAX_SLOTS && (
              <span className="text-xs text-gray-500 ml-1">외 {count - MAX_SLOTS}개</span>
            )}
            {count === 0 && (
              <span className="text-xs text-gray-400">보유 스탬프 없음</span>
            )}
          </div>

          {/* 사용 가능 횟수: 힐링데이 5개당 1회, 오후 인정 10개당 1회 */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`border rounded p-3 ${healingUsable > 0 ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
              <p className="text-xs font-semibold text-gray-600 mb-0.5">힐링데이</p>
              <p className="text-xs text-gray-500">5개당 1회 · 10:20 출근 또는 16:00 퇴근(1시간 40분) · 승인 불필요</p>
              <div className="mt-2">
                {healingUsable > 0 ? (
                  <span className="badge badge-success">최대 {healingUsable}회 사용 가능</span>
                ) : (
                  <span className="text-xs text-gray-400">{5 - count}개 더 모으면 1회</span>
                )}
              </div>
            </div>
            <div className={`border rounded p-3 ${afternoonUsable > 0 ? "border-purple-300 bg-purple-50" : "border-gray-200 bg-gray-50"}`}>
              <p className="text-xs font-semibold text-gray-600 mb-0.5">오후 인정휴가(스탬프)</p>
              <p className="text-xs text-gray-500">10개당 1회 · 연차 미차감 · 휴가 신청으로 처리</p>
              <div className="mt-2">
                {afternoonUsable > 0 ? (
                  <span className="badge badge-purple">최대 {afternoonUsable}회 사용 가능</span>
                ) : (
                  <span className="text-xs text-gray-400">{10 - count}개 더 모으면 1회</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 힐링데이 신청 */}
      {count >= 5 && (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">힐링데이 신청</span>
            <span className="badge badge-default">1회당 스탬프 5개 소진 · 보유분으로 여러 번 신청 가능</span>
          </div>
          <div className="panel-body space-y-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded px-3 py-2">
              <AlertCircle size={13} className="text-blue-500 shrink-0" />
              힐링데이는 10:20 출근 또는 16:00 퇴근(1시간 40분)으로 처리되며 연차에 포함되지 않습니다. 1회 신청 시 스탬프 5개를 소진합니다.
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="label">적용 날짜</label>
                <input type="date" className="input" value={hdDate} onChange={(e) => setHdDate(e.target.value)} />
              </div>
              <button onClick={applyHealingDay} disabled={hdLoading} className="btn-primary whitespace-nowrap">
                {hdLoading ? <><span className="spinner" /><span>처리중</span></> : "힐링데이 등록"}
              </button>
            </div>
            {hdMsg && (
              <p className={`text-xs ${hdMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{hdMsg}</p>
            )}
          </div>
        </div>
      )}

      {/* 힐링데이 이력 */}
      {healingLogs.length > 0 && (
        <div className="panel">
          <div className="panel-header"><span className="panel-title">힐링데이 이력</span></div>
          <table className="data-table">
            <thead><tr><th>날짜</th><th>상태</th></tr></thead>
            <tbody>
              {healingLogs.map((h) => (
                <tr key={h.id}>
                  <td>{formatYMD(h.startDate)}</td>
                  <td><span className="badge badge-success">등록완료</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 스탬프 요청 */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">스탬프 요청 (팀장 서명)</span>
        </div>
        <div className="panel-body">
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-3 py-2 mb-4">
            <AlertCircle size={13} className="text-gray-400 shrink-0" />
            오후 6시 반영 시 팀장에게 스탬프 서명을 요청하세요.
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">반영 날짜</label>
                <input type="date" className="input" value={reqForm.stampDate}
                  onChange={(e) => setReqForm((p) => ({ ...p, stampDate: e.target.value }))} />
              </div>
              <div>
                <label className="label">반영 내용</label>
                <input className="input" placeholder="예: 3/3 오후 6시 반영"
                  value={reqForm.description}
                  onChange={(e) => setReqForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
            {reqMsg && (
              <p className={`text-xs ${reqMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{reqMsg}</p>
            )}
            <button onClick={submitStampReq} disabled={reqLoading} className="btn-primary">
              {reqLoading ? <><span className="spinner" /><span>요청중</span></> : "팀장 서명 요청"}
            </button>
          </div>
        </div>
      </div>

      {/* 스탬프 요청 내역 */}
      {stampRequests.length > 0 && (
        <div className="panel">
          <div className="panel-header"><span className="panel-title">요청 내역</span></div>
          <table className="data-table">
            <thead><tr><th>날짜</th><th>내용</th><th>상태</th><th>비고</th></tr></thead>
            <tbody>
              {stampRequests.map((sr) => {
                const s = SR_STATUS[sr.status] ?? SR_STATUS.PENDING;
                return (
                  <tr key={sr.id}>
                    <td>{formatYMD(sr.stampDate)}</td>
                    <td className="max-w-[160px] truncate">{sr.description}</td>
                    <td>
                      <span className={`badge ${s.cls} inline-flex items-center gap-1`}>
                        {s.icon}{s.label}
                      </span>
                    </td>
                    <td className="text-gray-400 text-xs">{sr.comment ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
