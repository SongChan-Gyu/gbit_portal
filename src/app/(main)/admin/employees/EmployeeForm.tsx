"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Team { id:string; name:string; }
interface Employee {
  id:string; empNo:string; name:string; teamId:string|null; position:string;
  dutyDept:string|null; role:string; employeeType:string; hireDate:string; birthDate:string|null;
  phone:string; email:string|null; status:string;
  emailEnabled: boolean;
  alimtalkEnabled: boolean;
}

const ROLES = [["STAFF","팀원"],["TEAM_LEAD","팀장"],["PM","PM"],["ADMIN","관리자"]];
const TYPES = [["FULL","정규직"],["FREE","프리랜서"],["EXTERNAL","외부개발자"]];
const POSITIONS = [["사원","사원"],["대리","대리"],["과장","과장"],["차장","차장"],["부장","부장"],["이사","이사"]];
/** 직급부서: 귀속연도 초기화 시 운영부/교육부/복지부 소속이면 직무부서휴가 2일 부여. 외부개발자는 휴가 미관리 */
const DUTY_DEPT_OPTIONS = [
  ["", "선택 안함"],
  ["OPERATIONS", "운영부"],
  ["EDUCATION", "교육부"],
  ["WELFARE", "복지부"],
  ["NONE", "해당사항없음"],
];

export default function EmployeeForm({ teams, employee }: { teams:Team[]; employee?:Employee }) {
  const router = useRouter();
  const [form, setForm] = useState<Partial<Employee>>(employee
    ? {
      ...employee,
      hireDate: String(employee.hireDate).slice(0,10),
      dutyDept: employee.dutyDept ?? "",
      birthDate: employee.birthDate ? String(employee.birthDate).slice(0,10) : "",
    }
    : {
      role:"STAFF",
      employeeType:"FULL",
      status:"PENDING",
      dutyDept:"",
      emailEnabled: false,
      alimtalkEnabled: false,
    }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isEdit = !!employee;

  function set(k: keyof Employee, v: string) {
    setForm((p) => ({ ...p, [k]:v }));
  }
  function setBool(k: "emailEnabled" | "alimtalkEnabled", v: boolean) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await fetch(isEdit ? `/api/admin/employees/${employee!.id}` : "/api/admin/employees", {
      method: isEdit ? "PATCH" : "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "저장 실패"); return; }
    router.push("/admin/employees");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {isEdit ? (
          <div>
            <label className="label">사번</label>
            <input className="input bg-gray-50" value={form.empNo??""} readOnly />
          </div>
        ) : (
          <div>
            <label className="label">사번</label>
            <p className="text-sm text-gray-500 py-2">저장 시 자동 부여됩니다.</p>
          </div>
        )}
        <div>
          <label className="label">이름 *</label>
          <input className="input" value={form.name??""} onChange={(e)=>set("name",e.target.value)} required />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">팀</label>
          <select className="input" value={form.teamId??""} onChange={(e)=>set("teamId",e.target.value)}>
            <option value="">팀 없음</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">직급 *</label>
          <select className="input" value={form.position??""} onChange={(e)=>set("position",e.target.value)} required>
            {POSITIONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="label">직급부서 (귀속연도 초기화 시 2일 부여 대상)</label>
        <select className="input" value={form.dutyDept??""} onChange={(e)=>set("dutyDept",e.target.value||"")}>
          {DUTY_DEPT_OPTIONS.map(([v,l]) => <option key={v||"none"} value={v}>{l}</option>)}
        </select>
        <p className="text-xs text-gray-500 mt-1">운영부·교육부·복지부 선택 시 귀속연도 초기화 시 직무부서휴가 2일 자동 부여</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">역할 *</label>
          <select className="input" value={form.role??""} onChange={(e)=>set("role",e.target.value)}>
            {ROLES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label">고용유형</label>
          <select className="input" value={form.employeeType??""} onChange={(e)=>set("employeeType",e.target.value)}>
            {TYPES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">입사일 *</label>
          <input type="date" className="input" value={form.hireDate??""} onChange={(e)=>set("hireDate",e.target.value)} required />
        </div>
        <div>
          <label className="label">생년월일</label>
          <input type="date" className="input" value={form.birthDate??""} onChange={(e)=>set("birthDate",e.target.value||"")} />
          <p className="text-xs text-gray-500 mt-1">생일반차쿠폰 자동 부여용</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">연락처</label>
          <input className="input" value={form.phone??""} onChange={(e)=>set("phone",e.target.value)}
            placeholder="010-0000-0000" />
        </div>
        <div>
          <label className="label">이메일</label>
          <input type="email" className="input" value={form.email??""} onChange={(e)=>set("email",e.target.value)} />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700">알림 수신 설정</p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!form.emailEnabled}
            onChange={(e) => setBool("emailEnabled", e.target.checked)}
          />
          <span className="text-sm text-gray-700">이메일 전송(수신) 사용</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!form.alimtalkEnabled}
            onChange={(e) => setBool("alimtalkEnabled", e.target.checked)}
          />
          <span className="text-sm text-gray-700">카카오 알림톡 사용</span>
        </label>
        <p className="text-xs text-gray-500">
          기본값은 모두 미사용입니다. 운영 정책에 따라 사원 본인이 내 정보에서 켤 수 있습니다.
        </p>
      </div>

      {isEdit && (
        <div>
          <label className="label">상태</label>
          <select className="input" value={form.status??""} onChange={(e)=>set("status",e.target.value)}>
            {[["PENDING","미초대"],["INVITED","초대발송"],["ACTIVE","재직"],["INACTIVE","퇴직"]].map(([v,l])=>(
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={()=>router.back()} className="btn-secondary flex-1">취소</button>
        <button type="submit" className="btn-primary flex-1" disabled={loading}>
          {loading ? "저장 중..." : isEdit ? "수정 완료" : "사원 등록"}
        </button>
      </div>
    </form>
  );
}
