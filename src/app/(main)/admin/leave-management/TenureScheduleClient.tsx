"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar, RefreshCw, Award, CheckCircle } from "lucide-react";

interface Row {
  fiscalYear: number;
  employeeId: string;
  name: string;
  teamName: string;
  code: string;
  label: string;
  days: number;
  grantDate: string;
  alreadyGranted: boolean;
}

export default function TenureScheduleClient({ currentFy }: { currentFy: number }) {
  const [fy, setFy] = useState(currentFy);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/tenure-schedule?fy=${fy}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "조회 실패");
        setRows([]);
        return;
      }
      setRows(data.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fy]);

  useEffect(() => {
    load();
  }, [load]);

  const thisFy = rows.filter((r) => r.fiscalYear === fy);
  const nextFy = rows.filter((r) => r.fiscalYear === fy + 1);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        이번 귀속연도({fy}.05 ~ {fy + 1}.04)와 다음 귀속연도({fy + 1}.05 ~ {fy + 2}.04)에
        스케줄러가 부여할(또는 이미 부여한) 근속휴가 예정입니다. 실제 부여는 매일 00:15 근속 기념일 체크 시 자동 적용됩니다.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">귀속연도</span>
          <select
            className="input py-1.5 text-sm w-28"
            value={fy}
            onChange={(e) => setFy(parseInt(e.target.value, 10))}
          >
            {[currentFy - 1, currentFy, currentFy + 1].map((y) => (
              <option key={y} value={y}>
                {y}년도
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
          새로고침
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">조회 중...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">
          해당 기간 내 근속휴가 예정 건이 없습니다.
        </div>
      ) : (
        <div className="space-y-6">
          {/* 이번 귀속연도 */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
              <Calendar size={14} className="text-gray-600" />
              <span className="font-semibold text-sm text-gray-800">
                {fy}년도 ({fy}.05.01 ~ {fy + 1}.04.30)
              </span>
              <span className="text-xs text-gray-500">({thisFy.length}건)</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-100/80 text-xs text-gray-600">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">직원</th>
                  <th className="px-4 py-2.5 text-left font-semibold hidden sm:table-cell">팀</th>
                  <th className="px-4 py-2.5 text-left font-semibold">부여예정일</th>
                  <th className="px-4 py-2.5 text-left font-semibold">구분</th>
                  <th className="px-4 py-2.5 text-center font-semibold">일수</th>
                  <th className="px-4 py-2.5 text-center font-semibold">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {thisFy.map((r, i) => (
                  <tr key={`${r.employeeId}-${r.grantDate}-${r.code}-${i}`} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{r.name}</td>
                    <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">{r.teamName}</td>
                    <td className="px-4 py-2.5 text-gray-700">{r.grantDate}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 text-violet-700 font-medium">
                        <Award size={12} />
                        {r.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center font-semibold text-blue-600">+{r.days}일</td>
                    <td className="px-4 py-2.5 text-center">
                      {r.alreadyGranted ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                          <CheckCircle size={12} /> 이미 부여됨
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          예정
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 다음 귀속연도 */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
              <Calendar size={14} className="text-gray-600" />
              <span className="font-semibold text-sm text-gray-800">
                {fy + 1}년도 ({fy + 1}.05.01 ~ {fy + 2}.04.30)
              </span>
              <span className="text-xs text-gray-500">({nextFy.length}건)</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-100/80 text-xs text-gray-600">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">직원</th>
                  <th className="px-4 py-2.5 text-left font-semibold hidden sm:table-cell">팀</th>
                  <th className="px-4 py-2.5 text-left font-semibold">부여예정일</th>
                  <th className="px-4 py-2.5 text-left font-semibold">구분</th>
                  <th className="px-4 py-2.5 text-center font-semibold">일수</th>
                  <th className="px-4 py-2.5 text-center font-semibold">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {nextFy.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-sm">
                      다음 귀속연도 예정 건 없음
                    </td>
                  </tr>
                ) : (
                  nextFy.map((r, i) => (
                    <tr key={`${r.employeeId}-${r.grantDate}-${r.code}-${i}`} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{r.name}</td>
                      <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">{r.teamName}</td>
                      <td className="px-4 py-2.5 text-gray-700">{r.grantDate}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1 text-violet-700 font-medium">
                          <Award size={12} />
                          {r.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center font-semibold text-blue-600">+{r.days}일</td>
                      <td className="px-4 py-2.5 text-center">
                        {r.alreadyGranted ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                            <CheckCircle size={12} /> 이미 부여됨
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                            예정
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
