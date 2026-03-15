"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

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
};

export default function PublicFormPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const [form, setForm] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [submitterPhone, setSubmitterPhone] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/forms/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error("폼을 찾을 수 없습니다.");
        return res.json();
      })
      .then((data) => {
        setForm(data);
        const init: Record<string, string> = {};
        data.fields.forEach((f: Field) => {
          init[f.id] = "";
        });
        setAnswers(init);
      })
      .catch(() => setError("폼을 찾을 수 없거나 비활성화되었습니다."))
      .finally(() => setLoading(false));
  }, [slug]);

  const setAnswer = (fieldId: string, value: string) => {
    setAnswers((p) => ({ ...p, [fieldId]: value }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const name = submitterName.trim();
    if (!name) {
      alert("이름을 입력해 주세요.");
      return;
    }
    const required = form.fields.filter((f) => f.required);
    for (const f of required) {
      if (!String(answers[f.id] ?? "").trim()) {
        alert(`필수 항목을 입력해 주세요: ${f.label}`);
        return;
      }
    }
    setSubmitting(true);
    const res = await fetch(`/api/forms/${slug}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submitterName: name,
        submitterEmail: submitterEmail.trim() || undefined,
        submitterPhone: submitterPhone.trim() || undefined,
        answers,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      alert(data.error ?? "제출에 실패했습니다.");
      return;
    }
    setSuccess(true);
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="rounded-xl bg-white border border-gray-200 p-8 max-w-md text-center">
          <h1 className="text-xl font-semibold text-gray-800 mb-2">제출 완료</h1>
          <p className="text-gray-600">작성해 주셔서 감사합니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-xl mx-auto">
        <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-gray-800 mb-1">{form.title}</h1>
          {form.description && (
            <p className="text-sm text-gray-500 mb-6 whitespace-pre-wrap">{form.description}</p>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">제출자 정보</h2>
              <p className="text-xs text-gray-500 mb-3">제출 시 항상 수집되는 항목입니다.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={submitterName}
                    onChange={(e) => setSubmitterName(e.target.value)}
                    placeholder="본인 이름"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이메일 (선택)</label>
                  <input
                    type="email"
                    className="input w-full"
                    value={submitterEmail}
                    onChange={(e) => setSubmitterEmail(e.target.value)}
                    placeholder="example@email.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">연락처 (선택)</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={submitterPhone}
                    onChange={(e) => setSubmitterPhone(e.target.value)}
                    placeholder="010-0000-0000"
                  />
                </div>
              </div>
            </div>

            {form.fields.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-3">양식 질문</h2>
                <div className="space-y-4">
            {form.fields.map((f) => (
              <div key={f.id}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {f.label}
                  {f.required && " *"}
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
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
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
    </div>
  );
}
