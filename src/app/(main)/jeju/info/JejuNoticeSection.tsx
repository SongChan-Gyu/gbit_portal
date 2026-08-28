"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";

export default function JejuNoticeSection({
  initialItems,
  canEdit,
}: {
  initialItems: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(initialItems);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function startEdit() {
    setDraft(items.length > 0 ? [...items] : [""]);
    setError("");
    setEditing(true);
  }

  function cancelEdit() {
    setDraft([...items]);
    setError("");
    setEditing(false);
  }

  function updateDraft(index: number, value: string) {
    setDraft((prev) => prev.map((row, i) => (i === index ? value : row)));
  }

  function addRow() {
    setDraft((prev) => [...prev, ""]);
  }

  function removeRow(index: number) {
    setDraft((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/jeju-notice-items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: draft }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "저장에 실패했습니다.");
      return;
    }
    const next = Array.isArray(data.items) ? data.items : draft.map((x) => x.trim()).filter(Boolean);
    setItems(next);
    setDraft(next);
    setEditing(false);
    router.refresh();
  }

  return (
    <section id="notice" className="card scroll-mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800">
          <AlertTriangle size={18} className="text-amber-500" />
          이용주의사항
        </h2>
        {canEdit && !editing && (
          <button type="button" onClick={startEdit} className="btn-secondary btn-sm inline-flex items-center gap-1.5">
            <Pencil size={14} />
            편집
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">항목을 추가·수정·삭제한 뒤 저장하세요.</p>
          {draft.map((text, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-amber-500 shrink-0 pt-2.5 text-sm">•</span>
              <textarea
                className="input flex-1 min-h-[72px] resize-y text-sm py-2"
                value={text}
                onChange={(e) => updateDraft(i, e.target.value)}
                placeholder="이용주의사항 내용"
                maxLength={500}
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                disabled={draft.length <= 1}
                className="shrink-0 p-2 rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                aria-label="항목 삭제"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button type="button" onClick={addRow} className="btn-ghost text-sm inline-flex items-center gap-1.5">
            <Plus size={14} />
            항목 추가
          </button>
          {error && (
            <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={save} disabled={saving} className="btn-primary">
              {saving ? "저장 중…" : "저장"}
            </button>
            <button type="button" onClick={cancelEdit} disabled={saving} className="btn-secondary">
              취소
            </button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3 text-[13px] text-gray-700 list-none">
          {items.map((text, i) => (
            <li key={`${i}-${text.slice(0, 24)}`} className="flex gap-2">
              <span className="text-amber-500 shrink-0">•</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
