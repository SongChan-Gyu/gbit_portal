import { BookOpen, Info, AlertCircle, Calendar, Clock, Award, Heart, Stethoscope, Baby } from "lucide-react";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { redirect } from "next/navigation";

export const metadata = { title: "휴가 규정 안내 | GBIT Portal" };

const FISCAL_NOTE = "귀속기간: 매년 5월 1일 ~ 다음해 4월 30일";

const CONDOLENCE_LEAVES = [
  { event:"본인 결혼",                    days:"5일",  category:"경조" },
  { event:"자녀 결혼",                    days:"1일",  category:"경조" },
  { event:"배우자 출산",                  days:"10일", category:"경조" },
  { event:"형제·자매 결혼 / 배우자 부모 결혼", days:"1일", category:"경조" },
  { event:"부모상 / 배우자 부모상",         days:"9일",  category:"조의" },
  { event:"배우자상 / 자녀상 / 조부모상",   days:"5일",  category:"조의" },
  { event:"형제·자매상 / 배우자 형제·자매상","days":"3일", category:"조의" },
  { event:"그 외 친족상",                  days:"1일",  category:"조의" },
];

const SPECIAL_LEAVES = [
  {
    name:"돌봄휴가",
    icon:"Heart",
    days:"2일 (연간)",
    color:"rose",
    rules:[
      "본인 또는 배우자 자녀의 간호·돌봄 목적",
      "조부모, 증조부모, 외조부모 간호 포함",
      "증빙자료 제출 불필요",
      "연차에서 차감되지 않는 별도 휴가",
    ],
  },
  {
    name:"하프데이 (오후 인정)",
    icon:"Clock",
    days:"월 1회",
    color:"violet",
    rules:[
      "전 직원 월 1회 사용 가능",
      "오후 인정 (반차와 동일한 효과)",
      "팀장 승인 필요",
      "연차에서 차감되지 않음",
    ],
  },
  {
    name:"스탬프 쿠폰",
    icon:"Stamp",
    days:"운영반영일 기준",
    color:"amber",
    rules:[
      "반영일 출근 시 스탬프 1칸 (팀장 승인)",
      "4칸: 힐링데이 · 8칸: 오후 인정(장당 각 1회)",
    ],
  },
  {
    name:"포상휴가",
    icon:"Award",
    days:"1~5일",
    color:"sky",
    rules:[
      "특별 성과 또는 부서 포상 목적",
      "인사/PM 주도로 결정·부여",
      "부서 포상: 2일",
      "개인 성과: 1~5일 (결정에 따름)",
    ],
  },
  {
    name:"대체휴가",
    icon:"Calendar",
    days:"해당 일수",
    color:"teal",
    rules:[
      "공휴일 또는 일요일에 업무상 근무한 경우",
      "당직·야간 근무 포함",
      "해당 근무일수만큼 대체 적용",
      "연차와 별도 (차감 없음)",
    ],
  },
  {
    name:"병가",
    icon:"Stethoscope",
    days:"최대 60일",
    color:"orange",
    rules:[
      "진단서 제출 필요 (의사 소견)",
      "1~30일: 기준급여의 50% 지급",
      "31~60일: 기준급여의 30% 지급",
      "60일 초과 또는 무급 처리 가능",
      "30일 단위로 최대 60일 한도 계산",
    ],
  },
];

const NOTES = [
  "모든 휴가는 영업일 기준으로 산정합니다 (주말·공휴일 제외).",
  "휴가 사용 3개월 이전에 소진하지 않은 연차는 이월되지 않습니다 (관리자 별도 처리 제외).",
  "프리랜서의 경우 2023/9/1부터 정규직과 동일한 휴가 기준이 적용됩니다.",
  "경조휴가는 해당 사유 발생일로부터 7일 이상 경과 시 사용 불가합니다.",
  "휴가 신청은 원칙적으로 사전 신청이며, 사후 처리는 팀장·PM 협의 후 가능합니다.",
  "포상휴가·대체휴가는 PM 또는 인사 담당자 부여가 필요하며 직접 신청 불가합니다.",
  "병가 사용 7일 이상 시에는 진단서를 반드시 제출해야 합니다.",
  "연차 1년 미만 월별 발생분은 해당 귀속연도 말(4/30)까지 사용해야 합니다.",
];

const FISCAL_EXAMPLES = [
  { label:"2018년 입사자 → 2019년 휴가",  value:"12일 + 1년근속 3일 + 포상휴가 (해당 시)" },
  { label:"2019년 입사자 → 2020년 휴가",  value:"12일 + 1년근속 3일 (말일 상관없음)" },
  { label:"5년 근속 (예: 2020/5/10 입사)", value:"2025/5/10부터 5년근속휴가 5일 발생 (1년 이내 사용)" },
];

// ─────────────────── 유틸 ───────────────────
function Badge({ text, color }: { text:string; color:string }) {
  const cls: Record<string,string> = {
    경조:"bg-blue-50 text-blue-700 border-blue-100",
    조의:"bg-slate-100 text-slate-700 border-slate-200",
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${cls[color] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
      {text}
    </span>
  );
}

function Section({ title, children }: { title:string; children:React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
        <h2 className="text-sm font-bold text-gray-800">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

// ─────────────────── 컴포넌트 ───────────────────
export default async function LeavePolicyPage() {
  const session = await auth();
  const user = session!.user as any;
  const [self, sourceConfigs] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: user.employeeId },
      select: { employeeType: true },
    }),
    prisma.allocationSourceConfig.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  if (self?.employeeType === "EXTERNAL") redirect("/dashboard");

  const baseAnnualCfg  = sourceConfigs.find((s) => s.sourceCode === "BASE_ANNUAL");
  const tenureBonusCfg = sourceConfigs.find((s) => s.sourceCode === "TENURE_BONUS");
  const BASE_DAYS      = Number(baseAnnualCfg?.defaultDays ?? 15);
  const BONUS_INTERVAL = Number(tenureBonusCfg?.bonusIntervalYears ?? 2);
  const BONUS_MAX      = Number(tenureBonusCfg?.bonusMaxDays ?? 10);
  const MAX_TOTAL      = BASE_DAYS + BONUS_MAX;

  const ANNUAL_RULES = [
    { label:"기본 연차",           value:`${BASE_DAYS}일 (입사 1년 이상 정규/프리랜서 공통)` },
    { label:"근속 가산",           value:`${BONUS_INTERVAL}년마다 +1일 (최대 ${MAX_TOTAL}일)` },
    { label:"1년 미만 (입사 첫해)", value:"매월 만근 시 1일 발생 (최대 11일)" },
    { label:"귀속연도",            value:"매년 5월 1일 초기화" },
    { label:"프리랜서",            value:"2023/9/1부터 정규직 동일 적용" },
  ];

  const tenureMilestoneCfgs = sourceConfigs.filter((s) => s.tenureYears != null)
    .sort((a, b) => (a.tenureYears ?? 0) - (b.tenureYears ?? 0));
  const TENURE_LEAVES = tenureMilestoneCfgs.map((s) => ({
    milestone: `${s.tenureYears}년 근속`,
    days:      `${s.defaultDays ?? 0}일`,
    note:      s.tenureYears === 1
      ? "만근일 기준 해당 귀속연도 내 사용"
      : "만근일 기준 1년 이내 사용",
  }));

  return (
    <div className="max-w-4xl mx-auto space-y-5 px-4 py-6">
      {/* 헤더 */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
          <BookOpen size={20} className="text-white"/>
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">휴가 규정 안내</h1>
          <p className="text-sm text-gray-500 mt-0.5">㈜지비아이티 사내 휴가 제도 규정 · {FISCAL_NOTE}</p>
        </div>
      </div>

      {/* 연차 */}
      <Section title="연차 (Annual Leave)">
        <div className="space-y-2.5">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {ANNUAL_RULES.map(({label,value}) => (
                <tr key={label}>
                  <td className="py-2.5 pr-4 text-gray-600 font-medium text-[13px] w-44 shrink-0">{label}</td>
                  <td className="py-2.5 text-gray-800 text-[13px]">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-800">
            <p className="font-semibold mb-1">귀속연도별 연차 계산 예시</p>
            <ul className="space-y-1">
              {FISCAL_EXAMPLES.map(({label,value}) => (
                <li key={label} className="text-[13px]">
                  <span className="font-medium">{label}:</span> {value}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* 근속휴가 */}
      <Section title="근속 휴가 (Tenure Leave)">
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">구분</th>
                <th className="px-4 py-2.5 text-center font-semibold">일수</th>
                <th className="px-4 py-2.5 text-left font-semibold hidden sm:table-cell">비고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {TENURE_LEAVES.map(({milestone,days,note}) => (
                <tr key={milestone} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{milestone}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="bg-violet-100 text-violet-700 text-xs font-semibold px-2.5 py-1 rounded-full">{days}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-[13px] hidden sm:table-cell">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2.5 flex items-center gap-1.5">
          <Info size={12}/> 근속휴가는 입사일 기준으로 자동 산정되며, 유효기간 내 미사용 시 소멸됩니다.
        </p>
      </Section>

      {/* 경조휴가 */}
      <Section title="경조 휴가 (Congratulatory / Condolence Leave)">
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">사유</th>
                <th className="px-4 py-2.5 text-center font-semibold">일수</th>
                <th className="px-4 py-2.5 text-center font-semibold hidden sm:table-cell">구분</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {CONDOLENCE_LEAVES.map(({event,days,category}) => (
                <tr key={event} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-800 text-[13px]">{event}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${category==="경조" ? "bg-blue-50 text-blue-700":"bg-slate-100 text-slate-700"}`}>{days}</span>
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    <Badge text={category} color={category}/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2.5 flex items-center gap-1.5">
          <Info size={12}/> 경조 사유 발생일로부터 7일 이내에 신청해야 합니다.
        </p>
      </Section>

      {/* 특별/기타 휴가 */}
      <Section title="특별·기타 휴가">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SPECIAL_LEAVES.map(({name,days,color,rules}) => {
            const colorMap: Record<string,{border:string;bg:string;badge:string;badgeText:string}> = {
              rose:   {border:"border-rose-200",   bg:"bg-rose-50/40",   badge:"bg-rose-100",   badgeText:"text-rose-700"},
              violet: {border:"border-violet-200", bg:"bg-violet-50/40", badge:"bg-violet-100", badgeText:"text-violet-700"},
              amber:  {border:"border-amber-200",  bg:"bg-amber-50/40",  badge:"bg-amber-100",  badgeText:"text-amber-700"},
              sky:    {border:"border-sky-200",    bg:"bg-sky-50/40",    badge:"bg-sky-100",    badgeText:"text-sky-700"},
              teal:   {border:"border-teal-200",   bg:"bg-teal-50/40",   badge:"bg-teal-100",   badgeText:"text-teal-700"},
              orange: {border:"border-orange-200", bg:"bg-orange-50/40", badge:"bg-orange-100", badgeText:"text-orange-700"},
            };
            const c = colorMap[color] ?? colorMap.sky;
            return (
              <div key={name} className={`rounded-xl border ${c.border} ${c.bg} p-4`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-800 text-[14px]">{name}</h3>
                  <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${c.badge} ${c.badgeText}`}>{days}</span>
                </div>
                <ul className="space-y-1.5">
                  {rules.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12px] text-gray-700">
                      <span className="text-gray-400 mt-0.5 shrink-0">·</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Section>

      {/* 반차 안내 */}
      <Section title="반차 (Half-Day Leave)">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label:"오전 반차", time:"오전 시간대", note:"오후 출근 기준 (일반적으로 점심 이후)", deduct:true },
            { label:"오후 반차", time:"오후 시간대", note:"오전만 근무 후 조기 퇴근", deduct:true },
          ].map(({label,time,note,deduct}) => (
            <div key={label} className="rounded-xl border border-gray-200 p-4 bg-gray-50/40">
              <h3 className="font-semibold text-gray-800 mb-1.5 text-[14px]">{label}</h3>
              <p className="text-[12px] text-gray-600">{time}</p>
              <p className="text-[12px] text-gray-500 mt-1">{note}</p>
              <p className={`text-[11px] mt-2 font-medium ${deduct?"text-red-600":"text-emerald-600"}`}>
                {deduct ? "연차 0.5일 차감" : "연차 미차감"}
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5">
          <Info size={12}/> 오전·오후 반차를 같은 날 동시 신청하면 1일 연차 사용과 동일합니다.
        </p>
      </Section>

      {/* 주의사항 */}
      <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle size={16} className="text-amber-600 shrink-0"/>
          <h2 className="text-sm font-bold text-amber-800">공통 유의사항</h2>
        </div>
        <ul className="space-y-2">
          {NOTES.map((note, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-amber-900">
              <span className="text-amber-400 mt-0.5 shrink-0 font-bold">{i+1}.</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-center text-xs text-gray-400 pb-4">
        규정 관련 문의는 인사팀 또는 PM에게 문의하세요 · 최종 업데이트: 2023.11 기준
      </p>
    </div>
  );
}
