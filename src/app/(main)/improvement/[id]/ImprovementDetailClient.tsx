"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatYMD } from "@/lib/dateUtils";

type Author = { id: string; name: string };

type Reply = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  author: Author;
};

type CommentNode = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  author: Author;
  replies: Reply[];
};

type Post = {
  id: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  authorId: string;
  author: Author;
  closedBy: Author | null;
};

function CommentBlock({
  postId,
  open,
  node,
  onPosted,
}: {
  postId: string;
  open: boolean;
  node: CommentNode;
  onPosted: () => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const res = await fetch(`/api/improvement/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: replyBody, parentId: node.id }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setErr(data.error ?? "실패");
      return;
    }
    setReplyBody("");
    setReplyOpen(false);
    onPosted();
  }

  return (
    <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{node.body}</p>
      <p className="text-xs text-gray-500 mt-2">
        {node.author.name} · {formatYMD(node.createdAt)}
      </p>
      {node.replies.length > 0 && (
        <div className="mt-3 ml-3 pl-3 border-l-2 border-blue-100 space-y-2">
          {node.replies.map((r) => (
            <div key={r.id} className="text-sm">
              <p className="text-gray-800 whitespace-pre-wrap">{r.body}</p>
              <p className="text-xs text-gray-500 mt-1">
                {r.author.name} · {formatYMD(r.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
      {open && (
        <div className="mt-2">
          {!replyOpen ? (
            <button
              type="button"
              className="text-xs text-blue-600 font-medium hover:underline"
              onClick={() => setReplyOpen(true)}
            >
              답글
            </button>
          ) : (
            <form onSubmit={sendReply} className="mt-2 space-y-2">
              {err && <p className="text-xs text-red-600">{err}</p>}
              <textarea
                className="input w-full min-h-[72px] text-sm"
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="이 댓글에 대한 답글 (한 단계만 가능)"
              />
              <div className="flex gap-2">
                <button type="submit" className="btn-primary btn-sm" disabled={loading}>
                  등록
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    setReplyOpen(false);
                    setReplyBody("");
                  }}
                >
                  취소
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default function ImprovementDetailClient({
  initialPost,
  initialComments,
  viewer,
}: {
  initialPost: Post;
  initialComments: CommentNode[];
  viewer: { id: string; role: string };
}) {
  const router = useRouter();
  const [post, setPost] = useState(initialPost);
  const [comments, setComments] = useState(initialComments);
  const [topBody, setTopBody] = useState("");
  const [topErr, setTopErr] = useState("");
  const [topLoading, setTopLoading] = useState(false);

  const open = post.status === "OPEN";
  const canModerate =
    post.authorId === viewer.id || viewer.role === "PM" || viewer.role === "ADMIN";

  async function reload() {
    const res = await fetch(`/api/improvement/posts/${post.id}`);
    if (!res.ok) return;
    const data = await res.json();
    setPost(data.post);
    setComments(data.comments);
    router.refresh();
  }

  async function setStatus(next: "OPEN" | "CLOSED") {
    const res = await fetch(`/api/improvement/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "처리 실패");
      return;
    }
    await reload();
  }

  async function sendTopComment(e: React.FormEvent) {
    e.preventDefault();
    setTopErr("");
    setTopLoading(true);
    const res = await fetch(`/api/improvement/posts/${post.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: topBody }),
    });
    const data = await res.json().catch(() => ({}));
    setTopLoading(false);
    if (!res.ok) {
      setTopErr(data.error ?? "실패");
      return;
    }
    setTopBody("");
    await reload();
  }

  return (
    <div className="max-w-3xl">
      <Link href="/improvement" className="text-sm text-blue-600 hover:underline">
        ← 목록
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
        <h1 className="page-title flex-1 min-w-0">{post.title}</h1>
        <span
          className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
            open ? "bg-emerald-50 text-emerald-800" : "bg-gray-100 text-gray-600"
          }`}
        >
          {open ? "진행" : "종료"}
        </span>
      </div>

      <p className="text-xs text-gray-500 mt-1">
        {post.author.name} · 작성 {formatYMD(post.createdAt)} · 수정 {formatYMD(post.updatedAt)}
        {!open && post.closedBy && post.closedAt && (
          <> · 종료 {post.closedBy.name} · {formatYMD(post.closedAt)}</>
        )}
      </p>

      <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{post.body}</p>
      </div>

      {canModerate && (
        <div className="mt-3 flex flex-wrap gap-2">
          {open ? (
            <button type="button" className="btn-secondary text-sm py-2 px-3" onClick={() => setStatus("CLOSED")}>
              이 글 종료 (협의 마무리)
            </button>
          ) : (
            <button type="button" className="btn-secondary text-sm py-2 px-3" onClick={() => setStatus("OPEN")}>
              다시 열기
            </button>
          )}
        </div>
      )}

      <h2 className="text-sm font-bold text-gray-800 mt-8 mb-3">댓글·협의</h2>

      {open && (
        <form onSubmit={sendTopComment} className="mb-5 rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          {topErr && <p className="text-sm text-red-600">{topErr}</p>}
          <textarea
            className="input w-full min-h-[88px]"
            value={topBody}
            onChange={(e) => setTopBody(e.target.value)}
            placeholder="의견을 남겨 주세요."
          />
          <button type="submit" className="btn-primary text-sm py-2 px-4 rounded-lg" disabled={topLoading}>
            {topLoading ? "등록 중…" : "댓글 등록"}
          </button>
        </form>
      )}
      {!open && (
        <p className="text-sm text-gray-500 mb-4">종료된 글에는 새 댓글을 달 수 없습니다. 필요하면 다시 열기를 눌러 주세요.</p>
      )}

      <div className="space-y-3">
        {comments.length === 0 ? (
          <p className="text-sm text-gray-400">아직 댓글이 없습니다.</p>
        ) : (
          comments.map((c) => (
            <CommentBlock key={c.id} postId={post.id} open={open} node={c} onPosted={reload} />
          ))
        )}
      </div>
    </div>
  );
}
