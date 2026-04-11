"use client";

import { useState } from "react";
import { PRODUCTION_WIPE_CONFIRM_PHRASE } from "@/lib/productionWipeConstants";
import type { ProductionWipeCounts } from "@/lib/productionWipe";

const COUNT_LABELS: { key: keyof ProductionWipeCounts; label: string }[] = [
  { key: "employeesToDelete", label: "삭제될 사원 수" },
  { key: "usersToDelete", label: "삭제될 로그인 계정 수" },
  { key: "leaveRequests", label: "휴가 신청" },
  { key: "leaveAllocations", label: "휴가 부여(할당)" },
  { key: "jeju", label: "제주 예약" },
  { key: "stampRequests", label: "스탬프 요청" },
  { key: "notifications", label: "알림" },
  { key: "auditLogs", label: "감사 로그(초기화 후 비어 있음)" },
  { key: "teamsNeedNullLeader", label: "팀장 해제될 팀 수" },
  { key: "noticesReassignAuthor", label: "공지 작성자 이관 건수" },
];

export default function ProductionWipeTab() {
  const [keepInput, setKeepInput] = useState("admin");
  const [counts, setCounts] = useState<ProductionWipeCounts | null>(null);
  const [keepResolved, setKeepResolved] = useState<string[] | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"preview" | "execute" | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function runPreview() {
    setMessage(null);
    setLoading("preview");
    try {
      const res = await fetch("/api/admin/system/production-wipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", keepUsernames: keepInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCounts(null);
        setKeepResolved(null);
        setMessage({ type: "err", text: data.error ?? "미리보기 실패" });
        return;
      }
      setCounts(data.counts);
      setKeepResolved(data.keep ?? []);
      setMessage({ type: "ok", text: "미리보기를 불러왔습니다. 아래 숫자를 확인한 뒤에만 실행하세요." });
    } finally {
      setLoading(null);
    }
  }

  async function runExecute() {
    setMessage(null);
    if (!counts) {
      setMessage({ type: "err", text: "먼저 「미리보기」를 실행하세요." });
      return;
    }
    if (!window.confirm("정말 운영 데이터를 초기화합니다. 되돌릴 수 없습니다. 계속할까요?")) {
      return;
    }
    setLoading("execute");
    try {
      const res = await fetch("/api/admin/system/production-wipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute",
          keepUsernames: keepInput,
          confirmPhrase,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "err", text: data.error ?? "실행 실패" });
        return;
      }
      setMessage({
        type: "ok",
        text: `초기화가 완료되었습니다. 유지 계정: ${(data.keep as string[]).join(", ")}. 페이지를 새로고침합니다.`,
      });
      setPassword("");
      setConfirmPhrase("");
      setTimeout(() => {
        window.location.href = "/admin/system?tab=audit";
      }, 2000);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="rounded-lg border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-900 leading-relaxed">
        <p className="font-semibold">위험 작업</p>
        <p className="mt-1">
          지정한 로그인 계정(및 연결된 사원)만 남기고, 나머지 사원·휴가·제주·스탬프·알림·로그 등 운영 데이터를
          삭제합니다. 휴가 유형·팀·시스템 설정 등 마스터는 유지됩니다. 공지는 삭제하지 않으며 작성자만 유지
          사원으로 바뀝니다.
        </p>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">유지할 로그인 아이디</span>
        </div>
        <div className="panel-body space-y-2">
          <input
            className="input"
            value={keepInput}
            onChange={(e) => setKeepInput(e.target.value)}
            placeholder="admin 또는 admin,pm"
            autoComplete="off"
          />
          <p className="text-xs text-gray-500">
            쉼표로 구분. 반드시 <strong>지금 로그인한 관리자 아이디</strong>를 포함해야 합니다. 비우면{" "}
            <code className="text-[11px] bg-gray-100 px-1 rounded">admin</code>만 유지로 간주합니다.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={loading !== null}
          onClick={() => void runPreview()}
        >
          {loading === "preview" ? "불러오는 중…" : "미리보기"}
        </button>
      </div>

      {counts && keepResolved && (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">삭제 요약 (미리보기)</span>
          </div>
          <div className="panel-body space-y-2 text-sm">
            <p className="text-gray-600">
              유지 아이디: <span className="font-medium text-gray-900">{keepResolved.join(", ")}</span>
            </p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {COUNT_LABELS.map(({ key, label }) => (
                <li key={key} className="flex justify-between gap-2 border-b border-gray-100 pb-1 text-gray-700">
                  <span>{label}</span>
                  <span className="tabular-nums font-medium">{counts[key]}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">실행 확인</span>
        </div>
        <div className="panel-body space-y-4">
          <div>
            <label className="label">확인 문구 (아래를 그대로 복사해 입력)</label>
            <p className="text-xs text-gray-500 mb-1 font-mono bg-gray-100 px-2 py-1 rounded inline-block">
              {PRODUCTION_WIPE_CONFIRM_PHRASE}
            </p>
            <input
              className="input"
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
              placeholder="확인 문구 입력"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label">관리자 비밀번호 (현재 로그인 계정)</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button
            type="button"
            className="btn-danger"
            disabled={loading !== null || !counts}
            onClick={() => void runExecute()}
          >
            {loading === "execute" ? "처리 중…" : "운영 데이터 초기화 실행"}
          </button>
        </div>
      </div>

      {message && (
        <p
          className={`text-sm rounded-lg px-3 py-2 ${
            message.type === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
