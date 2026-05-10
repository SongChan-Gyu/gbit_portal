import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import RegisterForm from "./RegisterForm";
import { User, Calendar, Building2, Briefcase, Clock } from "lucide-react";
import { formatYMD, kstYmd } from "@/lib/dateUtils";
import { EXTERNAL_DEFAULT_HIRE_YMD } from "@/lib/employeeExcel";

export default async function RegisterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await prisma.inviteToken.findUnique({
    where: { token },
    include: { employee: { include: { team: true } } },
  });

  if (!invite) notFound();

  const now = new Date();
  const isExpired = invite.expiresAt < now;
  const isUsed = !!invite.usedAt;

  if (isExpired || isUsed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-blue-50 p-4">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex w-16 h-16 bg-red-100 rounded-2xl items-center justify-center text-red-500 text-3xl mb-4">
            {isUsed ? "✓" : "⏱"}
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">
            {isUsed ? "이미 사용된 링크" : "만료된 링크"}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {isUsed
              ? "이미 계정이 등록된 초대 링크입니다."
              : "초대 링크의 유효기간이 지났습니다. 관리자에게 새 링크를 요청해 주세요."}
          </p>
          <a href="/login" className="btn-primary w-full block text-center py-3">
            로그인 페이지로 이동
          </a>
        </div>
      </div>
    );
  }

  const emp = invite.employee;
  const hoursLeft = Math.floor((invite.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));
  const daysLeft  = Math.floor(hoursLeft / 24);
  const timeLabel = daysLeft > 0 ? `${daysLeft}일 ${hoursLeft % 24}시간` : `${hoursLeft}시간`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-blue-50 p-4">
      <div className="w-full max-w-sm">
        {/* 로고 */}
        <div className="text-center mb-6">
          <div className="inline-flex w-14 h-14 bg-blue-600 rounded-2xl items-center justify-center text-white font-black text-xl mb-3 shadow-lg shadow-blue-200">
            GBIT
          </div>
          <h1 className="text-2xl font-bold text-gray-900">계정 등록</h1>
          <p className="text-sm text-gray-500 mt-1">사용할 아이디와 비밀번호를 직접 설정하세요</p>
        </div>

        <div className="card shadow-xl border-0 space-y-5">
          {/* 직원 정보 */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                {emp.name[0]}
              </div>
              <div>
                <p className="font-bold text-gray-800">{emp.name}</p>
                <p className="text-xs text-gray-500">{emp.team?.name ?? "팀 미배정"} · {emp.position}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { icon: Building2, label: "팀", value: emp.team?.name ?? "-" },
                { icon: Briefcase, label: "직위", value: emp.position },
                // 외부개발자 더미 입사일(2000-01-01)은 표시하지 않음
                emp.employeeType !== "EXTERNAL" || kstYmd(emp.hireDate) !== EXTERNAL_DEFAULT_HIRE_YMD
                  ? { icon: Calendar, label: "입사일", value: formatYMD(emp.hireDate) }
                  : null,
                { icon: User, label: "사원번호", value: emp.empNo },
              ].filter(Boolean).map(({ icon: Icon, label, value }: any) => (
                <div key={label} className="flex items-center gap-1.5 text-gray-600">
                  <Icon size={11} className="text-gray-400 shrink-0" />
                  <span className="text-gray-400">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 유효기간 */}
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Clock size={13} className="shrink-0" />
            <span>이 링크는 <strong>{timeLabel}</strong> 후 만료됩니다.</span>
          </div>

          {/* 등록 폼 */}
          <RegisterForm token={token} employeeId={emp.id} existingEmail={emp.email ?? ""} />
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          이미 계정이 있으신가요?{" "}
          <a href="/login" className="text-blue-500 hover:underline">로그인</a>
        </p>
      </div>
    </div>
  );
}
