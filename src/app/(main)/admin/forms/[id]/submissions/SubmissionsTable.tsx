"use client";

type Row = {
  id: string;
  submitterName: string;
  submitterEmail: string;
  submitterPhone: string;
  createdAt: string;
  labelValues: Record<string, string>;
};

type SubmissionsTableProps = {
  formTitle: string;
  fields: string[];
  rows: Row[];
  isAnonymousForm?: boolean;
};

export default function SubmissionsTable({
  formTitle,
  fields,
  rows,
  isAnonymousForm,
}: SubmissionsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
        아직 제출된 내용이 없습니다.
      </div>
    );
  }

  const headers = ["제출일시", "이름", "이메일", "연락처", ...fields];

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
            <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/50 last:border-0">
              <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                {new Date(r.createdAt).toLocaleString("ko-KR")}
              </td>
              <td className="px-4 py-3 text-sm font-medium text-gray-800">
                {isAnonymousForm || r.submitterName === "익명" ? (
                  <span className="text-violet-800 font-semibold">익명</span>
                ) : (
                  r.submitterName
                )}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">{isAnonymousForm ? "—" : r.submitterEmail}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{isAnonymousForm ? "—" : r.submitterPhone}</td>
              {fields.map((f) => (
                <td key={f} className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate" title={r.labelValues[f] ?? ""}>
                  {r.labelValues[f] ?? "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
