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
  const [issueByEmail, setIssueByEmail] = useState(true);
  const [issueDirect, setIssueDirect] = useState(false);

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
      body: JSON.stringify({
        ...form,
        ...(isEdit
          ? {}
          : {
              accountProvision: {
                modes: [
                  ...(issueByEmail ? ["EMAIL_INVITE"] : []),
                  ...(issueDirect ? ["DIRECT_CREDENTIAL"] : []),
                ],
              },
            }),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "저장 실패"); return; }
    const notices = Array.isArray(data?.notices) ? data.notices.filter(Boolean) : [];
    if (notices.length > 0) {
      window.alert(notices.join("\n"));
    }
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

      {!isEdit && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">계정 생성 방식</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={issueByEmail} onChange={(e)=>setIssueByEmail(e.target.checked)} />
            이메일 초대 링크 발송 방식
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={issueDirect}
              onChange={(e)=>setIssueDirect(e.target.checked)}
            />
            사원정보 기반 즉시 계정 발급 방식
          </label>
          {issueDirect && (
            <div className="pt-1 text-xs text-gray-600 leading-relaxed rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
              아이디는 <b>휴대폰번호 숫자만</b>으로 생성되고, 비밀번호는 <b>생년월일 8자리</b>로 생성됩니다.
              <br />
              휴대폰번호 또는 생년월일이 없으면 해당 사원은 직접 발급을 건너뛰고 안내만 표시됩니다.
              <br />
              최초 로그인 시 아이디/비밀번호를 반드시 재설정해야 합니다.
            </div>
          )}
          <p className="text-xs text-gray-500">두 방식 동시 선택도 가능합니다. (즉시 발급 + 이메일 안내)</p>
        </div>
      )}

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

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">초기 알림 설정</p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!form.emailEnabled}
            onChange={(e) => setBool("emailEnabled", e.target.checked)}
          />
          <span className="text-sm text-gray-800">이메일 수신(초대·시스템 메일)</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!form.alimtalkEnabled}
            onChange={(e) => setBool("alimtalkEnabled", e.target.checked)}
          />
          <span className="text-sm text-gray-800">카카오 알림톡(휴가·초대 등)</span>
        </label>
        <p className="text-xs text-gray-500">기본은 꺼짐. 이후 본인이 내 정보에서 변경 가능.</p>
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
