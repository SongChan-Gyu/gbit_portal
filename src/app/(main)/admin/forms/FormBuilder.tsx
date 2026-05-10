"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, GripVertical } from "lucide-react";

export type FormFieldDef = {
  id?: string;
  label: string;
  fieldType: "text" | "textarea" | "number" | "date" | "select" | "radio" | "checkbox";
  options?: string[];
  required: boolean;
};

export type FormDef = {
  title: string;
  slug: string;
  description: string;
  isActive: boolean;
  showInMenu: boolean;
  audience: "ALL" | "INTERNAL" | "EXTERNAL";
  fields: FormFieldDef[];
};

const FIELD_TYPE_OPTIONS: { value: FormFieldDef["fieldType"]; label: string; desc: string }[] = [
  { value: "text",     label: "텍스트 (단문)",   desc: "한 줄 자유 입력" },
  { value: "textarea", label: "텍스트 (장문)",   desc: "여러 줄 자유 입력" },
  { value: "number",   label: "숫자",            desc: "숫자만 입력" },
  { value: "date",     label: "날짜",            desc: "날짜 선택" },
  { value: "select",   label: "드롭다운 선택",   desc: "목록에서 하나 선택" },
  { value: "radio",    label: "라디오 (단일선택)", desc: "항목 중 하나 선택" },
  { value: "checkbox", label: "체크박스 (복수선택)", desc: "항목 중 여러 개 선택" },
];

const OPTIONS_TYPES: FormFieldDef["fieldType"][] = ["select", "radio", "checkbox"];

const emptyField = (): FormFieldDef => ({
  label: "",
  fieldType: "text",
  required: false,
});

export default function FormBuilder({
  formId,
  initial,
}: {
  formId: string | null;
  initial?: FormDef | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormDef>({
    title: "",
    slug: "",
    description: "",
    isActive: true,
    showInMenu: false,
    audience: "ALL",
    fields: [],
  });

  useEffect(() => {
    if (initial) {
      setForm({
        title: initial.title,
        slug: initial.slug ?? "",
        description: initial.description ?? "",
        isActive: initial.isActive,
        showInMenu: initial.showInMenu ?? false,
        audience: (initial.audience as FormDef["audience"]) ?? "ALL",
        fields: initial.fields.map((f) => ({
          ...f,
          options: OPTIONS_TYPES.includes(f.fieldType) ? (f.options ?? [""]) : undefined,
        })),
      });
    }
  }, [initial]);

  const set = <K extends keyof FormDef>(key: K, value: FormDef[K]) => {
    setForm((p) => ({ ...p, [key]: value }));
  };

  const setField = (index: number, patch: Partial<FormFieldDef>) => {
    setForm((p) => ({
      ...p,
      fields: p.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));
  };

  const addField = () => {
    setForm((p) => ({ ...p, fields: [...p.fields, emptyField()] }));
  };

  const removeField = (index: number) => {
    setForm((p) => ({
      ...p,
      fields: p.fields.filter((_, i) => i !== index),
    }));
  };

  const slugFromTitle = () => {
    const s = form.title.trim().replace(/\s+/g, "-").toLowerCase();
    const norm = s.replace(/[^a-z0-9-]/g, "");
    if (norm) setForm((p) => ({ ...p, slug: norm }));
  };

  function handleFieldTypeChange(index: number, newType: FormFieldDef["fieldType"]) {
    const needsOptions = OPTIONS_TYPES.includes(newType);
    const hadOptions = OPTIONS_TYPES.includes(form.fields[index].fieldType);
    setField(index, {
      fieldType: newType,
      options: needsOptions
        ? (hadOptions ? form.fields[index].options : [""])
        : undefined,
    });
  }

  async function save() {
    setError("");
    if (!form.title.trim()) {
      setError("제목을 입력하세요.");
      return;
    }
    const payload = {
      title: form.title.trim(),
      slug: form.slug.trim().replace(/\s+/g, "-").toLowerCase() || null,
      description: form.description.trim() || null,
      isActive: form.isActive,
      showInMenu: form.showInMenu,
      audience: form.audience,
      fields: form.fields.map((f) => ({
        label: f.label.trim(),
        fieldType: f.fieldType,
        options: OPTIONS_TYPES.includes(f.fieldType)
          ? (f.options ?? []).filter(Boolean)
          : undefined,
        required: f.required,
      })),
    };

    setSaving(true);
    const url = formId ? `/api/admin/forms/${formId}` : "/api/admin/forms";
    const method = formId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "저장 실패");
      return;
    }
    router.push("/admin/forms");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {/* 기본 정보 */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">기본 정보</h2>
        <div>
          <label className="label">양식 제목 *</label>
          <input
            className="input w-full"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            onBlur={slugFromTitle}
            placeholder="예: 건강검진 신청"
          />
        </div>
        <div>
          <label className="label">URL 경로 (공개 링크, 선택)</label>
          <p className="text-xs text-gray-500 mb-1">
            영문 소문자·숫자·하이픈만. 예: health-check-2025. 비우면 포털 내부 메뉴로만 사용됩니다.
          </p>
          <input
            className="input w-full font-mono"
            value={form.slug}
            onChange={(e) => set("slug", e.target.value)}
            placeholder="health-check-2025 (선택)"
          />
          {form.slug.trim() && (
            <p className="text-xs text-gray-500 mt-1">공개 제출 링크: /f/{form.slug.trim()}</p>
          )}
        </div>
        <div>
          <label className="label">설명 (선택)</label>
          <textarea
            className="input w-full min-h-[80px]"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="안내 문구"
          />
        </div>
        <div className="space-y-3 pt-1">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
            />
            <span className="text-sm text-gray-700">활성화 (비활성 시 제출 불가)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.showInMenu}
              onChange={(e) => set("showInMenu", e.target.checked)}
            />
            <span className="text-sm text-gray-700">포털 사이드바 메뉴에 노출</span>
          </label>
        </div>
        {form.showInMenu && (
          <div>
            <label className="label">메뉴 노출 대상</label>
            <select
              className="input w-full"
              value={form.audience}
              onChange={(e) => set("audience", e.target.value as FormDef["audience"])}
            >
              <option value="ALL">전체 (내부직원 + 외부개발자)</option>
              <option value="INTERNAL">내부직원만</option>
              <option value="EXTERNAL">외부개발자만</option>
            </select>
          </div>
        )}
      </div>

      {/* 질문/필드 */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">질문/필드</h2>
          <button
            type="button"
            onClick={addField}
            className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> 필드 추가
          </button>
        </div>
        <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-800">
          이 양식 전용 질문입니다. 제출자 정보(이름·연락처·이메일)는 별도 수집하지 않습니다.
        </div>

        {form.fields.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">
            「필드 추가」를 눌러 질문을 추가하세요.
          </p>
        ) : (
          <ul className="space-y-3">
            {form.fields.map((f, i) => (
              <li key={i} className="border border-gray-200 rounded-xl p-4 bg-white">
                <div className="flex items-start gap-2">
                  <GripVertical className="w-4 h-4 text-gray-300 mt-2.5 shrink-0" />
                  <div className="flex-1 space-y-3">
                    {/* 질문명 + 필드 타입 */}
                    <div className="flex gap-2">
                      <input
                        className="input flex-1"
                        value={f.label}
                        onChange={(e) => setField(i, { label: e.target.value })}
                        placeholder="질문/필드명"
                      />
                      <select
                        className="input w-44 shrink-0"
                        value={f.fieldType}
                        onChange={(e) =>
                          handleFieldTypeChange(i, e.target.value as FormFieldDef["fieldType"])
                        }
                      >
                        {FIELD_TYPE_OPTIONS.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 필드 타입 설명 */}
                    <p className="text-xs text-gray-400">
                      {FIELD_TYPE_OPTIONS.find((t) => t.value === f.fieldType)?.desc}
                    </p>

                    {/* 옵션 입력 (select / radio / checkbox) */}
                    {OPTIONS_TYPES.includes(f.fieldType) && (
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">
                          선택 항목 (한 줄에 하나씩)
                        </label>
                        <textarea
                          className="input w-full min-h-[72px] text-sm font-mono"
                          value={(f.options ?? []).join("\n")}
                          onChange={(e) =>
                            setField(i, {
                              options: e.target.value.split(/\n/).map((s) => s.trim()),
                            })
                          }
                          placeholder={"항목1\n항목2\n항목3"}
                        />
                      </div>
                    )}

                    {/* 필수 여부 */}
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={f.required}
                        onChange={(e) => setField(i, { required: e.target.checked })}
                        className="w-4 h-4 accent-blue-600"
                      />
                      <span className="text-sm text-gray-600">필수 항목</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeField(i)}
                    className="text-gray-300 hover:text-red-500 p-1 mt-1 shrink-0 transition-colors"
                    title="삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-primary px-6 py-2.5 rounded-lg font-medium disabled:opacity-50"
        >
          {saving ? "저장 중..." : formId ? "수정 저장" : "양식 만들기"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-2.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          취소
        </button>
      </div>
    </div>
  );
}
