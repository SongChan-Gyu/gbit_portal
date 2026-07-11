"use client";

import { useRouter } from "next/navigation";
import HealthCheckDeleteButton from "@/app/(main)/health-check/HealthCheckDeleteButton";

type Row = {
  id: string;
  submitterName: string;
  submitterEmail: string;
  submitterPhone: string;
  createdAt: string;
  labelValues: Record<string, string>;
  applicantEmployee?: string;
};

type SubmissionsTableProps = {
  formTitle: string;
  fields: string[];
  rows: Row[];
  isAnonymousForm?: boolean;
  /** 건강검진 전체 내역: 신청한 직원(로그인 계정) 표시 */
  showApplicantEmployee?: boolean;
  /** 신청 직원 컬럼 사용 시 제출자 이름·이메일·연락처 컬럼 숨김 */
  omitSubmitterInfo?: boolean;
  /** 건강검진 전체 내역: 행 삭제 */
  showDelete?: boolean;
  /** 행 더블클릭 시 이동 경로 접두사 (예: /health-check/all → /health-check/all/{id}) */
  rowHrefPrefix?: string;
};

export default function SubmissionsTable({
  formTitle,
  fields,
  rows,
  isAnonymousForm,
  showApplicantEmployee,
  omitSubmitterInfo,
  showDelete,
  rowHrefPrefix,
}: SubmissionsTableProps) {
  const router = useRouter();
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
        아직 제출된 내용이 없습니다.
      </div>
    );
  }

  const headers = [
    "제출일시",
    ...(showApplicantEmployee ? ["신청 직원"] : []),
    ...(!omitSubmitterInfo ? ["이름", "이메일", "연락처"] : []),
    ...fields,
    ...(showDelete ? ["관리"] : []),
  ];

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="data-table w-full min-w-[600px]">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={`border-b border-gray-100 hover:bg-gray-50/50 last:border-0${rowHrefPrefix ? " cursor-pointer" : ""}`}
              title={rowHrefPrefix ? "더블클릭하여 상세보기" : undefined}
              onDoubleClick={() => {
                if (rowHrefPrefix) router.push(`${rowHrefPrefix}/${r.id}`);
              }}
            >
              <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                {new Date(r.createdAt).toLocaleString("ko-KR")}
              </td>
              {showApplicantEmployee && (
                <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                  {r.applicantEmployee ?? "-"}
                </td>
              )}
              {!omitSubmitterInfo && (
                <>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">
                    {isAnonymousForm || r.submitterName === "익명" ? (
                      <span className="text-violet-800 font-semibold">익명</span>
                    ) : (
                      r.submitterName
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{isAnonymousForm ? "—" : r.submitterEmail}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{isAnonymousForm ? "—" : r.submitterPhone}</td>
                </>
              )}
              {fields.map((f) => (
                <td key={f} className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate" title={r.labelValues[f] ?? ""}>
                  {r.labelValues[f] ?? "-"}
                </td>
              ))}
              {showDelete && (
                <td
                  className="px-4 py-3 text-sm whitespace-nowrap"
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <HealthCheckDeleteButton
                    submissionId={r.id}
                    className="text-xs font-medium text-red-600 hover:text-red-800 px-2 py-1 rounded border border-red-200 hover:bg-red-50 disabled:opacity-50"
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
