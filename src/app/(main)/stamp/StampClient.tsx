"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import { todayStr } from "@/lib/workdays";
import { formatYMD } from "@/lib/dateUtils";

interface StampDot {
  id: string;
  stampDate: string;
}
interface StampCardRow {
  id: string;
  sortOrder: number;
  filledCount: number;
  healingUsed: boolean;
  afternoonUsed: boolean;
  stamps: StampDot[];
}
interface SR {
  id: string;
  stampDate: string;
  description: string;
  status: string;
  approvedAt: string | null;
  comment: string | null;
}
interface HLog {
  id: string;
  startDate: string;
}
interface Emp {
  id: string;
  name: string;
  team: { name: string } | null;
  position: string;
}

const SR_STATUS: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  PENDING: { label: "대기", icon: <Clock size={12} />, cls: "badge-warning" },
  APPROVED: { label: "승인", icon: <CheckCircle2 size={12} />, cls: "badge-success" },
  REJECTED: { label: "반려", icon: <XCircle size={12} />, cls: "badge-danger" },
};

/** 힐링·오후 권한을 모두 쓴 장은 목록에서 숨김 (★ 누적은 유지) */
function cardVisible(c: StampCardRow) {
  return !(c.healingUsed && c.afternoonUsed);
}

export default function StampClient({
  stampCards,
  stampRequests,
  employee,
  healingLogs,
  healingAvail,
  afternoonAvail,
  totalStamps,
}: {
  stampCards: StampCardRow[];
  stampRequests: SR[];
  employee: Emp | null;
  healingLogs: HLog[];
  healingAvail: number;
  afternoonAvail: number;
  totalStamps: number;
}) {
  const router = useRouter();
  const visibleCards = stampCards.filter(cardVisible);

  const [reqForm, setReqForm] = useState({ stampDate: todayStr(), description: "" });
  const [reqLoading, setReqLoading] = useState(false);
  const [reqMsg, setReqMsg] = useState("");

  const [hdDate, setHdDate] = useState(todayStr());
  const [hdLoading, setHdLoading] = useState(false);
  const [hdMsg, setHdMsg] = useState("");

  async function submitStampReq() {
    if (!reqForm.description.trim()) {
      setReqMsg("반영 내용을 입력하세요.");
      return;
    }
    setReqLoading(true);
    setReqMsg("");
    const res = await fetch("/api/stamp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqForm),
    });
    const data = await res.json();
    setReqLoading(false);
    if (!res.ok) {
      setReqMsg(data.error ?? "요청 실패");
      return;
    }
    setReqMsg("✓ 스탬프 요청이 접수되었습니다.");
    setReqForm({ stampDate: todayStr(), description: "" });
    router.refresh();
  }

  async function applyHealingDay() {
    setHdLoading(true);
    setHdMsg("");
    const res = await fetch("/api/leave/healing-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: hdDate }),
    });
    const data = await res.json();
    setHdLoading(false);
    if (!res.ok) {
      setHdMsg(data.error ?? "신청 실패");
      return;
    }
    setHdMsg("✓ 힐링데이 이력이 등록되었습니다.");
    router.refresh();
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">스탬프 쿠폰</h1>
          <p className="page-subtitle">
            {employee?.name} · {employee?.team?.name} · {employee?.position}
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">스탬프 현황</span>
          <span className="text-sm font-bold text-amber-600">
            누적 <span className="text-lg">{totalStamps}</span>칸
          </span>
        </div>
        <div className="panel-body">
          <p className="text-xs text-gray-500 mb-3">
            10칸이 모이면 한 장이 완성됩니다. 한 장마다 힐링데이 1회(같은 장에 5칸 이상이면 가능)와 오후
            인정휴가 1회(장을 10칸 채운 경우) 권한이 생기며, 사용해도 ★ 칸은 그대로 보입니다. 힐링·오후를
            둘 다 쓴 완성 장은 아래 목록에서 숨깁니다.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div
              className={`border rounded p-3 ${healingAvail > 0 ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50"}`}
            >
              <p className="text-xs font-semibold text-gray-600 mb-0.5">힐링데이</p>
              <p className="text-xs text-gray-500">
                장당 1회 · 해당 장에 5칸 이상 · 스탬프 칸은 소모되지 않음
              </p>
              <div className="mt-2">
                {healingAvail > 0 ? (
                  <span className="badge badge-success">사용 가능 {healingAvail}회</span>
                ) : (
                  <span className="text-xs text-gray-400">조건에 맞는 장 없음</span>
                )}
              </div>
            </div>
            <div
              className={`border rounded p-3 ${afternoonAvail > 0 ? "border-purple-300 bg-purple-50" : "border-gray-200 bg-gray-50"}`}
            >
              <p className="text-xs font-semibold text-gray-600 mb-0.5">오후 인정(스탬프)</p>
              <p className="text-xs text-gray-500">장당 1회 · 10칸 완성 장만 · 휴가 신청</p>
              <div className="mt-2">
                {afternoonAvail > 0 ? (
                  <span className="badge badge-purple">사용 가능 {afternoonAvail}회</span>
                ) : (
                  <span className="text-xs text-gray-400">10칸 완성·오후 미사용 장 없음</span>
                )}
              </div>
            </div>
          </div>

          {visibleCards.length === 0 ? (
            <p className="text-xs text-gray-400">
              표시할 스탬프 장이 없습니다. (완성 후 혜택을 모두 쓴 장만 있거나 아직 칸이 없습니다.)
            </p>
          ) : (
            <div className="space-y-4">
              {visibleCards.map((card, idx) => {
                const n = card.stamps.length;
                const healingOk = card.filledCount >= 5 && !card.healingUsed;
                const afternoonOk = card.filledCount >= 10 && !card.afternoonUsed;
                return (
                  <div key={card.id} className="rounded-lg border border-amber-200/80 bg-amber-50/40 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-amber-900">
                        스탬프 장 {idx + 1}{" "}
                        <span className="font-normal text-amber-700/90">
                          ({card.filledCount}/10칸)
                        </span>
                      </span>
                      <span className="text-[10px] text-gray-500">
                        힐링{" "}
                        {card.healingUsed ? (
                          <span className="text-gray-600">사용함</span>
                        ) : healingOk ? (
                          <span className="text-emerald-600 font-medium">사용 가능</span>
                        ) : (
                          <span className="text-gray-400">
                            {card.filledCount < 5 ? `5칸까지 ${5 - card.filledCount}칸` : "—"}
                          </span>
                        )}
                        {" · "}오후{" "}
                        {card.afternoonUsed ? (
                          <span className="text-gray-600">사용함</span>
                        ) : afternoonOk ? (
                          <span className="text-purple-700 font-medium">사용 가능</span>
                        ) : (
                          <span className="text-gray-400">
                            {10 - card.filledCount > 0 ? `${10 - card.filledCount}칸 남음` : "—"}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <span
                          key={i}
                          title={i < n ? formatYMD(card.stamps[i]!.stampDate) : "빈 칸"}
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                            i < n ? "bg-amber-400 text-white" : "bg-gray-200 text-gray-300"
                          }`}
                        >
                          {i < n ? "★" : "☆"}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {healingAvail > 0 && (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">힐링데이 신청</span>
            <span className="badge badge-default">장·힐링 권한 1회 소진 (★ 칸 유지)</span>
          </div>
          <div className="panel-body space-y-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded px-3 py-2">
              <AlertCircle size={13} className="text-blue-500 shrink-0" />
              힐링데이는 10:20 출근 또는 16:00 퇴근(1시간 40분)으로 처리되며 연차에 포함되지 않습니다.
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="label">적용 날짜</label>
                <input type="date" className="input" value={hdDate} onChange={(e) => setHdDate(e.target.value)} />
              </div>
              <button onClick={applyHealingDay} disabled={hdLoading} className="btn-primary whitespace-nowrap">
                {hdLoading ? (
                  <>
                    <span className="spinner" />
                    <span>처리중</span>
                  </>
                ) : (
                  "힐링데이 등록"
                )}
              </button>
            </div>
            {hdMsg && (
              <p className={`text-xs ${hdMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{hdMsg}</p>
            )}
          </div>
        </div>
      )}

      {healingLogs.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">힐링데이 이력</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {healingLogs.map((h) => (
                <tr key={h.id}>
                  <td>{formatYMD(h.startDate)}</td>
                  <td>
                    <span className="badge badge-success">등록완료</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
                <input
                  type="date"
                  className="input"
                  value={reqForm.stampDate}
                  onChange={(e) => setReqForm((p) => ({ ...p, stampDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">반영 내용</label>
                <input
                  className="input"
                  placeholder="예: 3/3 오후 6시 반영"
                  value={reqForm.description}
                  onChange={(e) => setReqForm((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
            </div>
            {reqMsg && (
              <p className={`text-xs ${reqMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{reqMsg}</p>
            )}
            <button onClick={submitStampReq} disabled={reqLoading} className="btn-primary">
              {reqLoading ? (
                <>
                  <span className="spinner" />
                  <span>요청중</span>
                </>
              ) : (
                "팀장 서명 요청"
              )}
            </button>
          </div>
        </div>
      </div>

      {stampRequests.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">요청 내역</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>내용</th>
                <th>상태</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {stampRequests.map((sr) => {
                const s = SR_STATUS[sr.status] ?? SR_STATUS.PENDING;
                return (
                  <tr key={sr.id}>
                    <td>{formatYMD(sr.stampDate)}</td>
                    <td className="max-w-[160px] truncate">{sr.description}</td>
                    <td>
                      <span className={`badge ${s.cls} inline-flex items-center gap-1`}>
                        {s.icon}
                        {s.label}
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
