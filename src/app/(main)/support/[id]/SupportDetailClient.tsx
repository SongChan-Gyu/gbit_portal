"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatYMD } from "@/lib/dateUtils";

type Author = { id: string; name: string };

type Message = {
  id: string;
  body: string;
  createdAt: string;
  isStaffReply: boolean;
  author: Author;
};

type Ticket = {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  employeeId: string;
  employee: Author;
  messages: Message[];
};

export default function SupportDetailClient({
  initialTicket,
  viewer,
}: {
  initialTicket: Ticket;
  viewer: { id: string; role: string };
}) {
  const router = useRouter();
  const [ticket, setTicket] = useState(initialTicket);
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const isStaff = viewer.role === "PM" || viewer.role === "ADMIN";
  const isOwner = ticket.employeeId === viewer.id;
  const open = ticket.status === "OPEN";

  async function reload() {
    const res = await fetch(`/api/support/tickets/${ticket.id}`);
    if (!res.ok) return;
    const data = await res.json();
    setTicket(data.ticket);
    router.refresh();
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const res = await fetch(`/api/support/tickets/${ticket.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setErr(data.error ?? "전송 실패");
      return;
    }
    setBody("");
    await reload();
  }

  async function setStatus(next: "OPEN" | "CLOSED") {
    const res = await fetch(`/api/support/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "실패");
      return;
    }
    await reload();
  }

  return (
    <div className="max-w-3xl">
      <Link href="/support" className="text-sm text-blue-600 hover:underline">
        ← 목록
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
        <h1 className="page-title flex-1 min-w-0">{ticket.subject}</h1>
        <span
          className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
            open ? "bg-blue-50 text-blue-800" : "bg-gray-100 text-gray-600"
          }`}
        >
          {open ? "진행" : "종료"}
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        {isStaff && <span>요청자 {ticket.employee.name} · </span>}
        접수 {formatYMD(ticket.createdAt)} · 최종 {formatYMD(ticket.updatedAt)}
      </p>

      <div className="mt-5 space-y-3">
        {ticket.messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl border p-4 ${
              m.isStaffReply
                ? "border-indigo-200 bg-indigo-50/50 ml-0 md:ml-8"
                : "border-gray-200 bg-white mr-0 md:mr-8"
            }`}
          >
            <p className="text-xs font-semibold text-gray-600 mb-1">
              {m.author.name}
              {m.isStaffReply && (
                <span className="ml-2 text-indigo-700">(운영 답변)</span>
              )}
              <span className="font-normal text-gray-400 ml-2">{formatYMD(m.createdAt)}</span>
            </p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
      </div>

      {(isOwner || isStaff) && (
        <div className="mt-5 flex flex-wrap gap-2">
          {open ? (
            <button type="button" className="btn-secondary text-sm py-2 px-3" onClick={() => setStatus("CLOSED")}>
              문의 종료
            </button>
          ) : (
            <button type="button" className="btn-secondary text-sm py-2 px-3" onClick={() => setStatus("OPEN")}>
              다시 열기
            </button>
          )}
        </div>
      )}

      {open && (isOwner || isStaff) && (
        <form onSubmit={sendMessage} className="mt-6 rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <h2 className="text-sm font-bold text-gray-800">메시지 추가</h2>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <textarea
            className="input w-full min-h-[100px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={isStaff ? "답변을 입력하세요." : "추가로 전달할 내용을 입력하세요."}
          />
          <button type="submit" className="btn-primary text-sm py-2 px-4 rounded-lg" disabled={loading}>
            {loading ? "전송 중…" : "보내기"}
          </button>
        </form>
      )}
      {!open && <p className="mt-4 text-sm text-gray-500">종료된 문의에는 메시지를 추가할 수 없습니다.</p>}
    </div>
  );
}
