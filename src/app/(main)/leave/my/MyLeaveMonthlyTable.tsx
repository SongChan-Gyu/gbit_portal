"use client";

import { formatMDWithDay } from "@/lib/dateUtils";
import { mergedLeaveTypeLabel, formatLeaveItemDaysLabel } from "@/lib/leaveDisplay";

interface ReqItem {
  leaveTypeName:string; leaveTypeColor:string;
  leaveTypeApplyGroupKey?: string | null;
  timeSlot?: string | null;
  // 최소 정책 필드 (표시 통합용)
  isHalf?: boolean;
  isAmOnly?: boolean;
  isPmOnly?: boolean;
  allowsFullDay?: boolean | null;
  allowsHalfDay?: boolean | null;
  halfDayAmPm?: string | null;
  days:number; startDate:string; endDate:string;
}
interface Req {
  id:string; startDate:string; endDate:string; totalDays:number;
  items:ReqItem[];
}

interface Props {
  monthlyUsage: number[];
  monthLabels:  string[];
  requests:     Req[];
  fy:           number;
}

const MONTH_START = [5,6,7,8,9,10,11,12,1,2,3,4]; // 귀속연도 월 순서

export default function MyLeaveMonthlyTable({ monthlyUsage, monthLabels, requests, fy }: Props) {
  const fyStart = new Date(fy, 4, 1, 0, 0, 0, 0);
  const fyEnd   = new Date(fy + 1, 3, 30, 23, 59, 59, 999);
  const today   = new Date();

  return (
    <div className="overflow-x-auto">
      <p className="px-4 pt-3 text-xs text-amber-800 bg-amber-50 border-b border-amber-100">
        월별 표는 <strong>승인 완료</strong>된 휴가만 집계합니다. 결재 대기·반려는 「목록」 탭에서 확인하세요.
      </p>
      {/* 월별 사용 바 차트 */}
      <div className="p-4">
        <div className="grid grid-cols-12 gap-1 mb-1">
          {monthLabels.map((ml, mi) => (
            <div key={mi} className="text-center text-[10px] text-gray-500">{ml}</div>
          ))}
        </div>
        <div className="grid grid-cols-12 gap-1 mb-3">
          {monthlyUsage.map((d, mi) => (
            <div key={mi} className="flex flex-col items-center gap-0.5">
              <div className="text-[10px] font-medium text-blue-700">{d>0?d:""}</div>
              <div className="w-full bg-gray-100 rounded-sm overflow-hidden" style={{height:"24px"}}>
                {d > 0 && (
                  <div className="bg-blue-400 w-full rounded-sm"
                    style={{height:`${Math.min((d/5)*100,100)}%`, minHeight:"4px"}}/>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-500 text-right">
          연간 합계: <strong className="text-blue-700">{monthlyUsage.reduce((s,v)=>s+v,0).toFixed(1)}일</strong>
        </div>
      </div>

      {/* 월별 상세 */}
      <table className="data-table">
        <thead>
          <tr>
            <th>월</th>
            <th>사용일수</th>
            <th>내역</th>
          </tr>
        </thead>
        <tbody>
          {monthLabels.map((ml, mi) => {
            const m = MONTH_START[mi];
            const y = m >= 5 ? fy : fy+1;
            const monthReqs = requests.filter((r) => {
              const s = new Date(r.startDate);
              return s.getFullYear() === y && s.getMonth()+1 === m;
            });
            const hasUsage = monthlyUsage[mi] > 0;
            return (
              <tr key={mi} className={hasUsage ? "" : "text-gray-300"}>
                <td className="whitespace-nowrap font-medium text-gray-700">
                  {y}년 {ml}
                </td>
                <td className={`font-semibold ${hasUsage?"text-blue-700":""}`}>
                  {hasUsage ? `${monthlyUsage[mi]}일` : "-"}
                </td>
                <td>
                  {monthReqs.map((r) => (
                    <div key={r.id} className="text-xs text-gray-600 flex flex-wrap gap-1.5">
                      {r.items.map((it, ii) => (
                        <span key={ii} className="inline-flex items-center gap-1">
                          {(() => {
                            const { mergedName, mergedColor } = mergedLeaveTypeLabel(
                              {
                                name: it.leaveTypeName,
                                color: it.leaveTypeColor,
                                applyGroupKey: it.leaveTypeApplyGroupKey ?? null,
                                isHalf: !!it.isHalf,
                                isAmOnly: !!it.isAmOnly,
                                isPmOnly: !!it.isPmOnly,
                                allowsFullDay: it.allowsFullDay ?? null,
                                allowsHalfDay: it.allowsHalfDay ?? null,
                                halfDayAmPm: it.halfDayAmPm ?? null,
                              },
                              { timeSlot: it.timeSlot ?? null },
                            );
                            const c = mergedColor ?? it.leaveTypeColor;
                            return (
                              <>
                                <span className="w-2 h-2 rounded-full" style={{ background: c }} />
                                <span style={{ color: c }}>{mergedName}</span>
                              </>
                            );
                          })()}
                          <span className="text-gray-500">
                            {formatLeaveItemDaysLabel(
                              { days: it.days, timeSlot: it.timeSlot ?? null },
                              {
                                name: it.leaveTypeName,
                                color: it.leaveTypeColor,
                                applyGroupKey: it.leaveTypeApplyGroupKey ?? null,
                                isHalf: !!it.isHalf,
                                isAmOnly: !!it.isAmOnly,
                                isPmOnly: !!it.isPmOnly,
                                allowsFullDay: it.allowsFullDay ?? null,
                                allowsHalfDay: it.allowsHalfDay ?? null,
                                halfDayAmPm: it.halfDayAmPm ?? null,
                              },
                            )}
                          </span>
                          <span className="text-gray-400 text-[10px]">
                            ({formatMDWithDay(new Date(it.startDate))}
                            {it.startDate !== it.endDate &&
                              `~${formatMDWithDay(new Date(it.endDate))}`})
                          </span>
                        </span>
                      ))}
                    </div>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
