"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { Send, Eye, CheckSquare, Square, Users, CheckCircle2, Circle } from "lucide-react";

type EmpRow = {
  id: string;
  name: string;
  phone: string;
  employeeType: string;
  alimtalkEnabled: boolean;
  teamName: string | null;
  position: string;
  lastSentAt: string | null;
  submitted: boolean;
};

type Props = {
  formId: string;
  formTitle: string;
  formUrl: string;
  submitDeadlineLabel: string;
  hasSubmitDeadline: boolean;
  employees: EmpRow[];
};

const TEMPLATE_PREVIEW = (
  name: string,
  formTitle: string,
  submitDeadlineLabel: string,
  formUrl: string,
) => `[GBIT Portal]
${name}님, 임직원 대상 공식 양식 제출 안내입니다.

회사에서 요구하는 아래 양식을 기한 내 제출해 주세요.

■ 양식명: ${formTitle}
■ 제출 유효기간: ${submitDeadlineLabel}

포털 접속 후 작성·제출:
${formUrl}

※ 기한 내 미제출 시 업무 처리에 차질이 생길 수 있습니다.
※ 본인이 해당 대상이 아니면 무시해 주세요.`;

export default function FormAlimtalkClient({
  formId,
  formTitle,
  formUrl,
  submitDeadlineLabel,
  hasSubmitDeadline,
  employees,
}: Props) {
  const internal = useMemo(() => employees.filter((e) => e.employeeType !== "EXTERNAL"), [employees]);
  const external = useMemo(() => employees.filter((e) => e.employeeType === "EXTERNAL"), [employees]);

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [previewEmployee, setPreviewEmployee] = useState<EmpRow | null>(null);
  const [sending, setSending] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [sentMap, setSentMap] = useState<Record<string, string>>(
    () => Object.fromEntries(employees.filter((e) => e.lastSentAt).map((e) => [e.id, e.lastSentAt!])),
  );

  function toggle(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(group: EmpRow[], checked: boolean) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      for (const e of group) {
        if (checked) next.add(e.id);
        else next.delete(e.id);
      }
      return next;
    });
  }

  function isGroupAllChecked(group: EmpRow[]) {
    return group.length > 0 && group.every((e) => checkedIds.has(e.id));
  }

  async function handleSend() {
    if (checkedIds.size === 0) return;
    if (!window.confirm(`선택한 ${checkedIds.size}명에게 알림톡을 발송할까요?`)) return;
    setSending(true);
    setResultMsg(null);
    try {
      const res = await fetch(`/api/admin/forms/${formId}/send-alimtalk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeIds: Array.from(checkedIds) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResultMsg({ type: "error", text: data.error ?? "발송 실패" });
      } else {
        const now = new Date().toISOString();
        setSentMap((prev) => {
          const next = { ...prev };
          for (const id of checkedIds) next[id] = now;
          return next;
        });
        setCheckedIds(new Set());
        setResultMsg({ type: "ok", text: `${data.sent}명에게 발송 완료했습니다.` });
      }
    } catch {
      setResultMsg({ type: "error", text: "네트워크 오류" });
    }
    setSending(false);
  }

  function formatSentAt(iso: string) {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function EmployeeTable({ group, groupLabel }: { group: EmpRow[]; groupLabel: string }) {
    if (group.length === 0) return null;
    const allChecked = isGroupAllChecked(group);
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">{groupLabel}</span>
            <span className="text-xs text-gray-400">{group.length}명</span>
          </div>
          <button
            type="button"
            onClick={() => toggleGroup(group, !allChecked)}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800"
          >
            {allChecked ? <CheckSquare size={14} /> : <Square size={14} />}
            전체 선택
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="pl-3 py-2 w-8" />
                <th className="text-left px-2 py-2">이름</th>
                <th className="text-left px-2 py-2 hidden sm:table-cell">연락처</th>
                <th className="text-left px-2 py-2 hidden sm:table-cell">팀/직급</th>
                <th className="text-center px-2 py-2">제출여부</th>
                <th className="text-left px-2 py-2">최근 발송</th>
                <th className="px-2 py-2 w-16 text-center">미리보기</th>
              </tr>
            </thead>
            <tbody>
              {group.map((e, i) => {
                const checked = checkedIds.has(e.id);
                const lastSent = sentMap[e.id];
                const noPhone = !e.phone;
                return (
                  <tr
                    key={e.id}
                    className={`border-t border-gray-100 ${noPhone ? "opacity-50" : "cursor-pointer hover:bg-blue-50/40"} ${checked ? "bg-blue-50" : i % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}
                    onClick={() => !noPhone && toggle(e.id)}
                  >
                    <td className="pl-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={noPhone}
                        onChange={() => toggle(e.id)}
                        onClick={(ev) => ev.stopPropagation()}
                        className="w-4 h-4 accent-blue-600"
                      />
                    </td>
                    <td className="px-2 py-2.5 font-medium text-gray-900">{e.name}</td>
                    <td className="px-2 py-2.5 text-gray-500 hidden sm:table-cell">
                      {noPhone ? <span className="text-red-400 text-xs">번호없음</span> : e.phone}
                    </td>
                    <td className="px-2 py-2.5 text-gray-500 hidden sm:table-cell">
                      {[e.teamName, e.position].filter(Boolean).join(" / ")}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      {e.submitted ? (
                        <CheckCircle2 size={15} className="mx-auto text-green-500" />
                      ) : (
                        <Circle size={15} className="mx-auto text-gray-300" />
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-gray-500">
                      {lastSent ? (
                        <span className="text-green-600">{formatSentAt(lastSent)}</span>
                      ) : (
                        <span className="text-gray-300">미발송</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={(ev) => { ev.stopPropagation(); setPreviewEmployee(e); }}
                        className="text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!hasSubmitDeadline && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          제출 유효기간이 설정되지 않았습니다.{" "}
          <Link href={`/admin/forms/${formId}/edit`} className="font-semibold underline">
            양식 수정
          </Link>
          에서 기한을 입력한 뒤 알림톡을 발송해 주세요.
        </div>
      )}

      {/* 발송 액션 바 */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
        <div className="text-sm text-gray-600">
          {checkedIds.size > 0 ? (
            <span className="font-semibold text-blue-700">{checkedIds.size}명 선택됨</span>
          ) : (
            <span className="text-gray-400">발송할 직원을 선택하세요</span>
          )}
          {hasSubmitDeadline && (
            <span className="block text-xs text-gray-500 mt-0.5">제출 유효기간: {submitDeadlineLabel}</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || checkedIds.size === 0 || !hasSubmitDeadline}
          className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-50"
        >
          <Send size={14} />
          {sending ? "발송 중..." : `${checkedIds.size}명에게 발송`}
        </button>
      </div>

      {resultMsg && (
        <div className={`rounded-xl px-4 py-3 text-sm ${resultMsg.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {resultMsg.text}
        </div>
      )}

      {/* 내부직원 그룹 */}
      <EmployeeTable group={internal} groupLabel="내부직원" />

      {/* 외부개발자 그룹 */}
      <EmployeeTable group={external} groupLabel="외부개발자" />

      {employees.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">대상 직원이 없습니다.</div>
      )}

      {/* 미리보기 모달 */}
      {previewEmployee && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPreviewEmployee(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold text-gray-900">알림톡 미리보기</p>
              <button type="button" onClick={() => setPreviewEmployee(null)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">&times;</button>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <p className="text-xs text-yellow-700 mb-2 font-medium">카카오 알림톡 · {previewEmployee.name}</p>
              <pre className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-sans">
                {TEMPLATE_PREVIEW(previewEmployee.name, formTitle, submitDeadlineLabel, formUrl)}
              </pre>
            </div>
            <p className="text-xs text-gray-400 mt-3 leading-snug">
              실제 발송 본문은 카카오 승인 템플릿 기준이며, 위 내용은 참고용입니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
