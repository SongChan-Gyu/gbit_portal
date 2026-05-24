"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AudienceSelector, { type EmployeeGroupOption } from "@/components/audience/AudienceSelector";
import LoginAnnouncementModal from "@/components/login-announcement/LoginAnnouncementModal";
import type { AudienceCode } from "@/lib/audienceAccess";

type NoticeOpt = { id: string; title: string };

type Props = {
  announcementId?: string;
  initial?: {
    title: string;
    body: string;
    audience: AudienceCode;
    employeeGroupId: string | null;
    startsAt: string | null;
    endsAt: string | null;
    priority: number;
    detailMode: string;
    noticeId: string | null;
    isActive: boolean;
  };
};

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function LoginAnnouncementEditor({ announcementId, initial }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [audience, setAudience] = useState<AudienceCode>(initial?.audience ?? "INTERNAL");
  const [employeeGroupId, setEmployeeGroupId] = useState<string | null>(initial?.employeeGroupId ?? null);
  const [startsAt, setStartsAt] = useState(toLocalInputValue(initial?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInputValue(initial?.endsAt ?? null));
  const [priority, setPriority] = useState(initial?.priority ?? 0);
  const [detailMode, setDetailMode] = useState<"NONE" | "NOTICE">(
    initial?.detailMode === "NOTICE" ? "NOTICE" : "NONE",
  );
  const [noticeId, setNoticeId] = useState<string | null>(initial?.noticeId ?? null);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [groups, setGroups] = useState<EmployeeGroupOption[]>([]);
  const [notices, setNotices] = useState<NoticeOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [gRes, nRes] = await Promise.all([
        fetch("/api/admin/groups"),
        fetch("/api/admin/notices"),
      ]);
      if (cancel) return;
      if (gRes.ok) {
        const list = (await gRes.json()) as { id: string; name: string }[];
        setGroups(list.map((g) => ({ id: g.id, name: g.name })));
      }
      if (nRes.ok) {
        const list = (await nRes.json()) as NoticeOpt[];
        setNotices(list);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const noticeTitle = useMemo(
    () => notices.find((n) => n.id === noticeId)?.title ?? null,
    [notices, noticeId],
  );

  const payload = useMemo(
    () => ({
      id: announcementId ?? "preview",
      title: title.trim() || "제목 미입력",
      body: body.trim() || "본문을 입력하세요.",
      detailMode,
      noticeId: detailMode === "NOTICE" ? noticeId : null,
      noticeTitle,
    }),
    [announcementId, title, body, detailMode, noticeId, noticeTitle],
  );

  async function save() {
    setError("");
    if (!title.trim() || !body.trim()) {
      setError("제목과 본문을 입력하세요.");
      return;
    }
    if (audience === "GROUP" && !employeeGroupId) {
      setError("지정 그룹을 선택하세요.");
      return;
    }
    if (detailMode === "NOTICE" && !noticeId) {
      setError("연결할 공지를 선택하세요.");
      return;
    }

    setSaving(true);
    const url = announcementId
      ? `/api/admin/login-announcements/${announcementId}`
      : "/api/admin/login-announcements";
    const res = await fetch(url, {
      method: announcementId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body,
        audience,
        employeeGroupId,
        startsAt: startsAt || null,
        endsAt: endsAt || null,
        priority,
        detailMode,
        noticeId,
        isActive,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError((data as { error?: string }).error ?? "저장 실패");
      return;
    }
    router.push("/admin/login-announcements");
    router.refresh();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div>
          <label className="label">제목</label>
          <input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </div>
        <div>
          <label className="label">본문 (짧은 안내)</label>
          <textarea
            className="input w-full min-h-[140px] resize-y"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="로그인 팝업에 표시될 요약 내용"
            maxLength={5000}
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

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">노출 시작 (선택)</label>
            <input type="datetime-local" className="input w-full" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div>
            <label className="label">노출 종료 (선택)</label>
            <input type="datetime-local" className="input w-full" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">우선순위</label>
          <input
            type="number"
            className="input w-32"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
          />
          <p className="text-xs text-gray-500 mt-1">숫자가 클수록 먼저 표시됩니다.</p>
        </div>

        <div>
          <label className="label">자세히 보기</label>
          <select
            className="input w-full max-w-md"
            value={detailMode}
            onChange={(e) => {
              const v = e.target.value as "NONE" | "NOTICE";
              setDetailMode(v);
              if (v === "NONE") setNoticeId(null);
            }}
          >
            <option value="NONE">사용 안 함</option>
            <option value="NOTICE">공지사항 연결</option>
          </select>
          {detailMode === "NOTICE" && (
            <select
              className="input w-full max-w-md mt-2"
              value={noticeId ?? ""}
              onChange={(e) => setNoticeId(e.target.value || null)}
            >
              <option value="">— 공지 선택 —</option>
              {notices.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-slate-600" />
          활성 (체크 해제 시 노출되지 않음)
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={saving} className="btn-primary px-6 py-2.5 rounded-lg font-medium disabled:opacity-50">
          {saving ? "저장 중..." : announcementId ? "수정 저장" : "등록"}
        </button>
        <button type="button" onClick={() => setPreviewOpen(true)} className="btn-secondary px-6 py-2.5 rounded-lg font-medium">
          미리보기
        </button>
        <button type="button" onClick={() => router.back()} className="px-6 py-2.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
          취소
        </button>
      </div>

      {previewOpen && (
        <LoginAnnouncementModal data={payload} preview onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}
