"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle, RotateCcw } from "lucide-react";
import { renderFormField, validateFormField } from "@/components/forms/FormFieldInput";
import { formatRrn7 } from "@/lib/rrn7Input";

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
  isAnonymous?: boolean;
};

type PrevSubmission =
  | { submitted: false }
  | { submitted: true; submittedAt: string; answers: Record<string, string> };

function initialAnswer(f: Field, raw: string): string {
  if (f.fieldType === "rrn7") return formatRrn7(raw);
  return raw;
}

export default function FormSubmitClient({
  form,
  prevSubmission = { submitted: false },
  allowMultipleSubmissions = false,
  afterSubmitHref,
  editingSubmissionId,
}: {
  form: FormData;
  prevSubmission?: PrevSubmission;
  allowMultipleSubmissions?: boolean;
  afterSubmitHref?: string;
  /** 지정 시 해당 건을 수정 (다건 제출 양식) */
  editingSubmissionId?: string;
}) {
  const isEditMode = !!editingSubmissionId;

  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    form.fields.forEach((f) => {
      const fromPrev =
        prevSubmission.submitted && prevSubmission.answers[f.id] != null
          ? prevSubmission.answers[f.id]
          : "";
      init[f.id] =
        isEditMode || (!allowMultipleSubmissions && prevSubmission.submitted)
          ? initialAnswer(f, fromPrev)
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
      const msg = validateFormField(f, answers[f.id] ?? "");
      if (msg) {
        setError(msg);
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
      body: JSON.stringify({
        answers,
        ...(editingSubmissionId ? { submissionId: editingSubmissionId } : {}),
        _internal: true,
      }),
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
        <h1 className="text-xl font-bold text-gray-800 mb-1">{isEditMode ? "수정 완료" : "제출 완료"}</h1>
        <p className="text-gray-500 text-sm">
          {isEditMode
            ? "신청 내용이 수정·저장되었습니다."
            : allowMultipleSubmissions
              ? "신청 내용이 저장되었습니다. 가족 검진 등 추가 신청이 있으면 다시 작성해 주세요."
              : prevSubmission.submitted
                ? "내용이 업데이트되었습니다."
                : "작성해 주셔서 감사합니다."}
        </p>
        {afterSubmitHref && (
          <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-2">
            <Link href={afterSubmitHref} className="btn-primary px-5 py-2.5 rounded-xl text-sm">
              내 신청 내역 보기
            </Link>
            {allowMultipleSubmissions && (
              <button
                type="button"
                onClick={() => {
                  setSuccess(false);
                  setAnswers(Object.fromEntries(form.fields.map((f) => [f.id, ""])));
                }}
                className="btn-ghost px-5 py-2.5 rounded-xl text-sm text-gray-600"
              >
                추가 신청하기
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const isReadOnly = !isEditMode && !allowMultipleSubmissions && prevSubmission.submitted && !resubmitting;

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
        {/* 카드 상단 컬러 바 */}
        <div className="h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500" />

        <div className="p-5 sm:p-6">
          <h1 className="text-[17px] font-bold text-gray-900 mb-0.5">
            {isEditMode ? `${form.title} · 수정` : form.title}
          </h1>
          {form.description && (
            <p className="text-sm text-gray-500 mb-4 whitespace-pre-wrap leading-relaxed">{form.description}</p>
          )}
          {form.isAnonymous && (
            <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2.5 text-sm text-violet-900">
              <span className="font-semibold">익명 양식</span>
              <span className="text-violet-800/90"> — 제출자 이름은 집계·목록에서 익명으로 표시됩니다.</span>
            </div>
          )}

          {allowMultipleSubmissions && !isEditMode && (
            <div className="mb-5 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-900">
              본인·가족 각각 별도로 제출해 주세요. 제출할 때마다 신청 건이 저장됩니다.
            </div>
          )}

          {isEditMode && (
            <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
              제출한 내용을 수정한 뒤 <strong>수정 저장</strong>을 눌러 주세요.
            </div>
          )}

          {/* 기제출 배너 */}
          {!allowMultipleSubmissions && prevSubmission.submitted && !resubmitting && (
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
                    {renderFormField(f, answers[f.id] ?? "", (v) => setAnswer(f.id, v), isReadOnly)}
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
                {submitting
                  ? "저장 중..."
                  : isEditMode
                    ? "수정 저장"
                    : prevSubmission.submitted
                      ? "수정 완료 (다시 제출)"
                      : "제출하기"}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
