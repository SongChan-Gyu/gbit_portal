"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RichTextEditor from "@/components/RichTextEditor";
import AudienceSelector, { type EmployeeGroupOption } from "@/components/audience/AudienceSelector";
import type { AudienceCode } from "@/lib/audienceAccess";

type NoticeEditorProps = {
  noticeId?: string;
  initialTitle?: string;
  initialContent?: string;
  initialAudience?: AudienceCode;
  initialEmployeeGroupId?: string | null;
};

export default function NoticeEditor({
  noticeId,
  initialTitle = "",
  initialContent = "",
  initialAudience = "ALL",
  initialEmployeeGroupId = null,
}: NoticeEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [audience, setAudience] = useState<AudienceCode>(initialAudience);
  const [employeeGroupId, setEmployeeGroupId] = useState<string | null>(initialEmployeeGroupId);
  const [groups, setGroups] = useState<EmployeeGroupOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      const res = await fetch("/api/admin/groups");
      if (res.ok && !cancel) {
        const list = (await res.json()) as { id: string; name: string }[];
        setGroups(list.map((g) => ({ id: g.id, name: g.name })));
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  async function save() {
    setError("");
    if (!title.trim()) {
      setError("제목을 입력하세요.");
      return;
    }
    if (audience === "GROUP" && !employeeGroupId) {
      setError("지정 그룹을 선택하세요.");
      return;
    }
    setSaving(true);
    const url = noticeId ? `/api/admin/notices/${noticeId}` : "/api/admin/notices";
    const method = noticeId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), content, audience, employeeGroupId }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "저장 실패");
      return;
    }
    router.push(noticeId ? `/notices/${noticeId}` : "/admin/notices");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-2 text-sm">
          {error}
        </div>
      )}
      <div>
        <label className="label">제목</label>
        <input
          className="input w-full"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="공지 제목"
        />
      </div>
      <AudienceSelector
        audience={audience}
        employeeGroupId={employeeGroupId}
        groups={groups}
        onAudienceChange={(v) => {
          setAudience(v);
          if (v !== "GROUP") setEmployeeGroupId(null);
        }}
        onGroupChange={setEmployeeGroupId}
      />
      <div>
        <label className="label">내용</label>
        <RichTextEditor value={content} onChange={setContent} minHeight="280px" />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-primary px-6 py-2.5 rounded-lg font-medium disabled:opacity-50"
        >
          {saving ? "저장 중..." : noticeId ? "수정 저장" : "등록"}
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
