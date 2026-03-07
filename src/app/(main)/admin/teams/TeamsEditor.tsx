"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Emp { id:string; name:string; position:string; teamId:string|null; }
interface Team { id:string; name:string; sortOrder:number; leaderId:string|null; leader:Emp|null; employees:Emp[]; }

export default function TeamsEditor({ teams, allEmployees }: { teams:Team[]; allEmployees:Emp[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<Team> & { isNew?:boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function openNew() { setEditing({ name:"", sortOrder:99, leaderId:null, isNew:true }); setErr(""); }
  function openEdit(t: Team) { setEditing({ ...t }); setErr(""); }

  async function save() {
    if (!editing?.name) { setErr("팀 이름을 입력하세요."); return; }
    setSaving(true); setErr("");
    const { isNew, ...payload } = editing;
    const url    = isNew ? "/api/admin/teams" : `/api/admin/teams/${editing.id}`;
    const method = isNew ? "POST" : "PATCH";
    const res = await fetch(url, { method, headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(data.error ?? "저장 실패"); return; }
    setEditing(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <button onClick={openNew} className="btn-primary text-sm py-2 px-4">+ 팀 추가</button>

      <div className="space-y-3">
        {teams.map((t) => (
          <div key={t.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-gray-800 text-lg">{t.name}</p>
                <p className="text-sm text-gray-500">팀장: {t.leader?.name ?? "미지정"}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {t.employees.map((e) => (
                    <span key={e.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {e.name} ({e.position})
                    </span>
                  ))}
                </div>
              </div>
              <button onClick={() => openEdit(t)} className="text-sm text-blue-500 hover:underline shrink-0">수정</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-4">{editing.isNew ? "팀 추가" : "팀 수정"}</h2>

            <div className="space-y-3">
              <div><label className="label">팀 이름 *</label>
                <input className="input" value={editing.name??""} onChange={(e)=>setEditing((p)=>p?{...p,name:e.target.value}:null)} /></div>
              <div><label className="label">팀장</label>
                <select className="input" value={editing.leaderId??""} onChange={(e)=>setEditing((p)=>p?{...p,leaderId:e.target.value||null}:null)}>
                  <option value="">팀장 미지정</option>
                  {allEmployees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.position})</option>
                  ))}
                </select></div>
              <div><label className="label">정렬 순서</label>
                <input type="number" className="input" value={editing.sortOrder??99}
                  onChange={(e)=>setEditing((p)=>p?{...p,sortOrder:parseInt(e.target.value)}:null)} /></div>
            </div>

            {err && <p className="text-sm text-red-500 mt-2">{err}</p>}

            <div className="flex gap-3 mt-5">
              <button onClick={()=>setEditing(null)} className="btn-secondary flex-1">취소</button>
              <button onClick={save} disabled={saving} className="btn-primary flex-1">
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
