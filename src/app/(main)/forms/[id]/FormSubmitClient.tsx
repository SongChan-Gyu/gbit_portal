"use client";

import { useState } from "react";
import { CheckCircle } from "lucide-react";

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

export default function FormSubmitClient({ form }: { form: FormData }) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    form.fields.forEach((f) => { init[f.id] = ""; });
    return init;
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const setAnswer = (fieldId: string, value: string) => {
    setAnswers((p) => ({ ...p, [fieldId]: value }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const required = form.fields.filter((f) => f.required);
    for (const f of required) {
      if (!String(answers[f.id] ?? "").trim()) {
        setError(`필수 항목을 입력해 주세요: ${f.label}`);
        return;
      }
    }
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
      <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-8 text-center max-w-xl mx-auto mt-8">
        <CheckCircle size={40} className="mx-auto text-green-500 mb-3" />
        <h1 className="text-xl font-semibold text-gray-800 mb-1">제출 완료</h1>
        <p className="text-gray-500 text-sm">작성해 주셔서 감사합니다.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-6">
        <h1 className="text-xl font-semibold text-gray-800 mb-1">{form.title}</h1>
        {form.description && (
          <p className="text-sm text-gray-500 mb-5 whitespace-pre-wrap">{form.description}</p>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-2 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {form.fields.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">질문이 없는 양식입니다.</p>
          ) : (
            <div className="space-y-4">
              {form.fields.map((f) => (
                <div key={f.id}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {f.label}
                    {f.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  {f.fieldType === "select" && f.options && f.options.length > 0 ? (
                    <select
                      className="input w-full"
                      value={answers[f.id] ?? ""}
                      onChange={(e) => setAnswer(f.id, e.target.value)}
                      required={f.required}
                    >
                      <option value="">선택하세요</option>
                      {f.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="input w-full"
                      value={answers[f.id] ?? ""}
                      onChange={(e) => setAnswer(f.id, e.target.value)}
                      required={f.required}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full btn-primary py-3 rounded-lg font-medium disabled:opacity-50"
          >
            {submitting ? "제출 중..." : "제출하기"}
          </button>
        </form>
      </div>
    </div>
  );
}
