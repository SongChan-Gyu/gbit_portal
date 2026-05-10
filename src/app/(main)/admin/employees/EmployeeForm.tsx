"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DatePickerButton from "@/components/ui/DatePickerButton";
import { todayKstYmd } from "@/lib/dateUtils";
import { INTERNAL_STAFF_FIXED_TEMP_PASSWORD } from "@/lib/employeeCompanyStaffNo";

interface Team { id:string; name:string; }
interface Employee {
  id:string; empNo:string; name:string; teamId:string|null; position:string;
  dutyDept:string|null; role:string; employeeType:string; hireDate:string; birthDate:string|null;
  phone:string; email:string|null; status:string;
  alimtalkEnabled: boolean;
  isSettingsAdmin: boolean;
  /** 회사 사번(로그인 ID). 외부 등은 비움 */
  companyStaffNo?: string | null;
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

function stripEmployeeForForm(raw: Record<string, unknown>): Partial<Employee> {
  const {
    emailEnabled: _e,
    user: _u,
    team: _t,
    id: rid,
    empNo,
    name,
    teamId,
    position,
    dutyDept,
    role,
    employeeType,
    hireDate,
    birthDate,
    phone,
    email,
    status,
    alimtalkEnabled,
  } = raw;
  const companyStaffNo = String(raw.companyStaffNo ?? "").trim();
  return {
    id: rid as string,
    empNo: empNo as string,
    companyStaffNo,
    name: name as string,
    teamId: (teamId as string | null) ?? null,
    position: position as string,
    dutyDept: (dutyDept as string | null) ?? null,
    role: role as string,
    employeeType: employeeType as string,
    hireDate: hireDate instanceof Date ? hireDate.toISOString().slice(0, 10) : String(hireDate ?? "").slice(0, 10),
    birthDate: birthDate
      ? birthDate instanceof Date
        ? birthDate.toISOString().slice(0, 10)
        : String(birthDate).slice(0, 10)
      : null,
    phone: (phone as string) ?? "",
    email: (email as string | null) ?? null,
    status: status as string,
    alimtalkEnabled: !!(alimtalkEnabled as boolean),
    isSettingsAdmin: !!(raw.isSettingsAdmin as boolean),
  };
}

export default function EmployeeForm({
  teams,
  employee,
  hasLinkedAccount = false,
  isAdmin = false,
}: {
  teams: Team[];
  employee?: Record<string, unknown>;
  /** 수정 시 계정(User)이 연결되어 있는지 */
  hasLinkedAccount?: boolean;
  /** true면 isSettingsAdmin 토글 노출 (ADMIN만 전달) */
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const today = todayKstYmd();
  const initialCompanyStaffNoRef = useRef(
    employee ? String(employee.companyStaffNo ?? "").trim() : "",
  );
  const [form, setForm] = useState<Partial<Employee>>(() => {
    if (employee) {
      const s = stripEmployeeForForm(employee);
      return {
        ...s,
        dutyDept: s.dutyDept ?? "",
        birthDate: s.birthDate ?? "",
      };
    }
    return {
      position: "사원",
      role:"STAFF",
      employeeType:"FULL",
      status:"PENDING",
      hireDate: today,
      dutyDept:"",
      alimtalkEnabled: false,
      isSettingsAdmin: false,
      companyStaffNo: "",
    };
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isEdit = !!employee;

  function set(k: keyof Employee, v: string) {
    setForm((p) => ({ ...p, [k]:v }));
  }
  function setAlimtalk(v: boolean) {
    setForm((p) => ({ ...p, alimtalkEnabled: v }));
  }
  function setSettingsAdmin(v: boolean) {
    setForm((p) => ({ ...p, isSettingsAdmin: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");

    let resetPasswordOnCompanyStaffNoChange: boolean | undefined;
    if (isEdit && hasLinkedAccount) {
      const prev = initialCompanyStaffNoRef.current.trim();
      const next = String(form.companyStaffNo ?? "").trim();
      if (next !== prev && next.length > 0) {
        const example = INTERNAL_STAFF_FIXED_TEMP_PASSWORD;
        const ok = window.confirm(
          `회사사번(로그인 ID)이 바뀝니다.\n\n` +
            `비밀번호를 「${example}」로 초기화하면, 해당 사원은 다음 로그인 시 이 비밀번호로 들어온 뒤 새 비밀번호를 반드시 설정해야 합니다.\n\n` +
            `[확인] 초기화 적용\n[취소] 로그인 ID만 바꾸고 비밀번호는 유지`,
        );
        resetPasswordOnCompanyStaffNoChange = ok;
      }
    }

    const payload: Record<string, unknown> = { ...form };
    if (resetPasswordOnCompanyStaffNoChange !== undefined) {
      payload.resetPasswordOnCompanyStaffNoChange = resetPasswordOnCompanyStaffNoChange;
    }

    const res = await fetch(isEdit ? `/api/admin/employees/${(form as Employee).id}` : "/api/admin/employees", {
      method: isEdit ? "PATCH" : "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload),
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

      <div>
        <label className="label">회사사번 (로그인 ID)</label>
        <input
          className="input max-w-md"
          value={form.companyStaffNo ?? ""}
          onChange={(e) => set("companyStaffNo", e.target.value)}
          placeholder="예: 200410 (내부 직원)"
          autoComplete="off"
        />
        <p className="text-xs text-gray-500 mt-1 leading-snug">
          내부 직원은 회사 사번을 입력합니다. <strong>계정이 없을 때</strong> 회사사번을 저장하면 로그인 계정이 자동으로 만들어지며, 초기 비밀번호는{" "}
          <strong className="tabular-nums">「{INTERNAL_STAFF_FIXED_TEMP_PASSWORD}」</strong> (고정 9자, 사번과 무관)이고 다음 로그인 시 변경해야 합니다. 이미 계정이 있으면 로그인 ID가 같이
          바뀌며, 저장 시 비밀번호를 같은 규칙으로 초기화할지 선택할 수 있습니다.
          외부개발자 등은 비워 두면 됩니다. 위 &quot;사번&quot;은 시스템 자동 부여 번호(E001…)로 그대로 둡니다.
        </p>
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
            <option value="" disabled>선택</option>
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
          <select
            className="input"
            value={form.employeeType ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setForm((p) => {
                const next: Partial<Employee> = { ...p, employeeType: v };
                if (v === "EXTERNAL" && !isEdit) next.hireDate = "";
                else if (v !== "EXTERNAL" && !String(p.hireDate ?? "").trim()) next.hireDate = today;
                return next;
              });
            }}
          >
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">
            입사일 {form.employeeType === "EXTERNAL" ? "(외부개발자는 생략 가능)" : "*"}
          </label>
          <DatePickerButton value={form.hireDate??""} onChange={(d)=>set("hireDate",d)} />
          {form.employeeType === "EXTERNAL" && (
            <p className="text-xs text-gray-500 mt-1">비우고 저장하면 시스템 기본 입사일로 저장됩니다.</p>
          )}
        </div>
        <div>
          <label className="label">생년월일</label>
          <input
            type="date"
            className="input"
            value={form.birthDate ?? ""}
            onChange={(e) => set("birthDate", e.target.value)}
          />
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
          <p className="text-xs text-gray-500 mt-1 leading-snug">
            주소가 있으면 <strong>초대·비밀번호 찾기·아이디 찾기</strong> 등 시스템 메일을 이 주소로 보냅니다. 별도
            &quot;허용&quot; 스위치는 없으며, 저장 시 주소 유무에 맞춰 내부 플래그만 맞춰 둡니다.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">알림톡</p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!form.alimtalkEnabled}
            onChange={(e) => setAlimtalk(e.target.checked)}
          />
          <span className="text-sm text-gray-800">카카오 알림톡(휴가·초대 등)</span>
        </label>
        <p className="text-xs text-gray-500">기본은 꺼짐. 이후 본인이 내 정보에서 변경 가능.</p>
      </div>

      {isAdmin && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-900">설정 관리자 권한 (ADMIN 전용)</p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!form.isSettingsAdmin}
              onChange={(e) => setSettingsAdmin(e.target.checked)}
            />
            <span className="text-sm text-amber-800">설정 메뉴 접근 허용</span>
          </label>
          <p className="text-xs text-amber-700 leading-snug">
            활성화 시 <strong>역할 변경 없이</strong> 휴가 유형 설정·휴가 부여·현황·유동 양식 관리 메뉴에 접근할 수 있습니다.
            결재선·인사 관리 등 다른 권한에는 영향 없음.
          </p>
        </div>
      )}

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
