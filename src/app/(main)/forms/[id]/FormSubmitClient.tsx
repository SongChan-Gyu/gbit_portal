"use client";

import { useState } from "react";
import { CheckCircle, RotateCcw } from "lucide-react";

type Field = {
  id: string;
  label: string;
  fieldType: string;
  options: string[] | null;
  required: boolean;
};

type FormData = {
  id: string;
  title: string;
  description: string | null;
  fields: Field[];
};

type PrevSubmission =
  | { submitted: false }
  | { submitted: true; submittedAt: string; answers: Record<string, string> };

function renderField(
  f: Field,
  value: string,
  onChange: (val: string) => void,
  disabled: boolean,
) {
  const opts = (f.options ?? []).filter(Boolean);

  switch (f.fieldType) {
    case "textarea":
      return (
        <textarea
          className="input w-full min-h-[80px]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={f.required}
          disabled={disabled}
        />
      );
    case "number":
      return (
        <input
          type="number"
          className="input w-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={f.required}
          disabled={disabled}
        />
      );
    case "date":
      return (
        <div className="input-date-shell">
          <input
            type="date"
            className="input input-date-compact"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={f.required}
            disabled={disabled}
          />
        </div>
      );
    case "select":
      return (
        <select
          className="input w-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={f.required}
          disabled={disabled}
        >
          <option value="">선택하세요</option>
          {opts.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    case "radio":
      return (
        <div className="space-y-1.5 mt-1">
          {opts.map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`field-${f.id}`}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                required={f.required}
                disabled={disabled}
                className="accent-blue-600"
              />
              <span className="text-sm text-gray-700">{opt}</span>
            </label>
          ))}
        </div>
      );
    case "checkbox": {
      const selected = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
      return (
        <div className="space-y-1.5 mt-1">
          {opts.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  value={opt}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => {
                    const next = checked
                      ? selected.filter((s) => s !== opt)
                      : [...selected, opt];
                    onChange(next.join(","));
                  }}
                  className="w-4 h-4 accent-blue-600"
                />
                <span className="text-sm text-gray-700">{opt}</span>
              </label>
            );
          })}
        </div>
      );
    }
    default:
      return (
        <input
          type="text"
          className="input w-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={f.required}
          disabled={disabled}
        />
      );
  }
}

export default function FormSubmitClient({
  form,
  prevSubmission = { submitted: false },
}: {
  form: FormData;
  prevSubmission?: PrevSubmission;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    form.fields.forEach((f) => {
      init[f.id] =
        prevSubmission.submitted && prevSubmission.answers[f.id] != null
          ? prevSubmission.answers[f.id]
          : "";
    });
    return init;
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [resubmitting, setResubmitting] = useState(false);

  const setAnswer = (fieldId: string, value: string) => {
    setAnswers((p) => ({ ...p, [fieldId]: value }));
  };

  function formatDate(iso: string) {
    const d = new Date(iso);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function validate() {
    for (const f of form.fields) {
      if (!f.required) continue;
      const val = String(answers[f.id] ?? "").trim();
      if (!val) {
        setError(`필수 항목을 입력해 주세요: ${f.label}`);
        return false;
      }
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setError("");
    setSubmitting(true);
    const res = await fetch(`/api/forms/${form.id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers, _internal: true }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "제출에 실패했습니다.");
      return;
    }
    setSuccess(true);
  }

  if (success) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-8 text-center max-w-xl mx-auto mt-8">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={32} className="text-green-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-1">제출 완료</h1>
        <p className="text-gray-500 text-sm">
          {prevSubmission.submitted ? "내용이 업데이트되었습니다." : "작성해 주셔서 감사합니다."}
        </p>
      </div>
    );
  }

  const isReadOnly = prevSubmission.submitted && !resubmitting;

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
        {/* 카드 상단 컬러 바 */}
        <div className="h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500" />

        <div className="p-5 sm:p-6">
          <h1 className="text-[17px] font-bold text-gray-900 mb-0.5">{form.title}</h1>
          {form.description && (
            <p className="text-sm text-gray-500 mb-4 whitespace-pre-wrap leading-relaxed">{form.description}</p>
          )}

          {/* 기제출 배너 */}
          {prevSubmission.submitted && !resubmitting && (
            <div className="mb-5 rounded-xl bg-green-50 border border-green-200 px-4 py-3 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <CheckCircle size={17} className="text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800">이미 제출 완료된 양식입니다</p>
                  <p className="text-xs text-green-600 mt-0.5">{formatDate(prevSubmission.submittedAt)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResubmitting(true)}
                className="shrink-0 flex items-center gap-1.5 text-xs text-green-700 hover:text-green-900 font-medium border border-green-300 bg-white rounded-lg px-2.5 py-1.5 hover:bg-green-50 transition-colors"
              >
                <RotateCcw size={11} />
                수정하기
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {form.fields.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">질문이 없는 양식입니다.</p>
            ) : (
              <div className="space-y-4">
                {form.fields.map((f) => (
                  <div key={f.id}>
                    <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
                      {f.label}
                      {f.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    {renderField(f, answers[f.id] ?? "", (v) => setAnswer(f.id, v), isReadOnly)}
                  </div>
                ))}
              </div>
            )}

            {isReadOnly ? (
              <p className="text-xs text-gray-400 text-center pt-1">
                내용을 변경하려면 「수정하기」를 눌러 주세요.
              </p>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="w-full btn-primary py-3 rounded-xl font-semibold disabled:opacity-50 mt-2"
              >
                {submitting ? "제출 중..." : prevSubmission.submitted ? "수정 완료 (다시 제출)" : "제출하기"}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
