"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
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
  slug: string;
  description: string | null;
  fields: Field[];
  isAnonymous?: boolean;
};

type SubmissionState =
  | { submitted: false }
  | { submitted: true; submittedAt: string; answers: Record<string, string> };

export default function PublicFormPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const [form, setForm] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [prevSubmission, setPrevSubmission] = useState<SubmissionState>({ submitted: false });
  const [resubmitting, setResubmitting] = useState(false);

  useEffect(() => {
    if (!slug) return;

    Promise.all([
      fetch(`/api/forms/${slug}`).then((r) => {
        if (!r.ok) throw new Error("폼을 찾을 수 없습니다.");
        return r.json() as Promise<FormData>;
      }),
      fetch(`/api/forms/${slug}/submit`).then((r) =>
        r.ok ? (r.json() as Promise<SubmissionState>) : { submitted: false as const },
      ),
    ])
      .then(([formData, subData]) => {
        setForm(formData);
        setPrevSubmission(subData);

        const init: Record<string, string> = {};
        formData.fields.forEach((f) => {
          const raw =
            subData.submitted && subData.answers[f.id] != null
              ? subData.answers[f.id]
              : "";
          init[f.id] = f.fieldType === "rrn7" ? formatRrn7(raw) : raw;
        });
        setAnswers(init);
      })
      .catch(() => setError("폼을 찾을 수 없거나 비활성화되었습니다."))
      .finally(() => setLoading(false));
  }, [slug]);

  const setAnswer = (fieldId: string, value: string) => {
    setAnswers((p) => ({ ...p, [fieldId]: value }));
  };

  function renderField(f: Field, value: string, disabled: boolean) {
    return renderFormField(f, value, (v) => setAnswer(f.id, v), disabled);
  }

  const isReadOnly = prevSubmission.submitted && !resubmitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    for (const f of form.fields) {
      const msg = validateFormField(f, answers[f.id] ?? "");
      if (msg) {
        alert(msg);
        return;
      }
    }
    if (prevSubmission.submitted && !resubmitting) {
      if (!window.confirm("이미 제출한 내용이 있습니다. 새 내용으로 덮어쓰겠습니까?")) return;
    }
    setSubmitting(true);
    const res = await fetch(`/api/forms/${slug}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      alert(data.error ?? "제출에 실패했습니다.");
      return;
    }
    setSuccess(true);
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <p className="text-gray-500">불러오는 중...</p>
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="rounded-xl bg-white border border-gray-200 p-6 max-w-md text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="text-green-500" size={32} />
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-1">제출 완료</h1>
          <p className="text-gray-500 text-sm">
            {prevSubmission.submitted ? "내용이 업데이트되었습니다." : "작성해 주셔서 감사합니다."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-8 px-4">
      <div className="max-w-xl mx-auto">
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
          {/* 카드 상단 컬러 바 */}
          <div className="h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500" />

          <div className="p-5 sm:p-7">
            <h1 className="text-[18px] font-bold text-gray-900 mb-0.5">{form.title}</h1>
            {form.description && (
              <p className="text-sm text-gray-500 mb-5 whitespace-pre-wrap leading-relaxed">{form.description}</p>
            )}
            {form.isAnonymous && (
              <div className="mb-5 rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2.5 text-sm text-violet-900">
                <span className="font-semibold">익명 양식</span>
                <span className="text-violet-800/90"> — 제출자 이름은 집계·목록에서 익명으로 표시됩니다.</span>
              </div>
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

            <form onSubmit={handleSubmit} className="space-y-4">
              {form.fields.length > 0 && (
                <div className="space-y-4">
                  {form.fields.map((f) => (
                    <div key={f.id}>
                      <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
                        {f.label}
                        {f.required && <span className="text-red-500 ml-0.5">*</span>}
                      </label>
                      {renderField(f, answers[f.id] ?? "", isReadOnly)}
                    </div>
                  ))}
                </div>
              )}

              {/* 기제출 상태에서 수정 모드 아니면 폼 숨기고 버튼만 */}
              {prevSubmission.submitted && !resubmitting ? (
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
                    ? "제출 중..."
                    : prevSubmission.submitted
                    ? "수정 완료 (다시 제출)"
                    : "제출하기"}
                </button>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
