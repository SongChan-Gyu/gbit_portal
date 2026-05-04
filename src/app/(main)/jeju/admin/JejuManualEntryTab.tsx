"use client";

import { useState } from "react";
import { ClipboardList, CheckCircle } from "lucide-react";

type EmpOption = {
  id: string;
  name: string;
  empNo: string;
  teamName: string | null;
  employeeType: string;
  status: string;
};

function externalInviteLabel(emp: EmpOption): string {
  if (emp.employeeType !== "EXTERNAL") return "";
  if (emp.status === "PENDING") return " · 미초대";
  if (emp.status === "INVITED") return " · 초대발송";
  return "";
}

type EntryResult = {
  id: string;
  nights: number;
  employeeName: string;
  startDate: string;
  endDate: string;
  guestName: string;
  guestCount: number;
};

export default function JejuManualEntryTab({ employees }: { employees: EmpOption[] }) {
  const [employeeId, setEmployeeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestCount, setGuestCount] = useState<number | "">(1);
  const [depositorName, setDepositorName] = useState("");
  const [note, setNote] = useState("이관 처리");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<EntryResult[]>([]);
  const [empSearch, setEmpSearch] = useState("");

  const q = empSearch.trim();
  const filteredEmps = q
    ? employees.filter((e) => {
        if (e.name.includes(q) || e.empNo.includes(q) || (e.teamName ?? "").includes(q)) return true;
        if (e.employeeType === "EXTERNAL" && e.status === "PENDING" && (q.includes("미초") || q === "미초대"))
          return true;
        if (e.employeeType === "EXTERNAL" && q.includes("외부")) return true;
        return false;
      })
    : employees;

  const selectedEmp = employees.find((e) => e.id === employeeId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!employeeId) { setError("신청자를 선택해 주세요."); return; }
    if (!startDate || !endDate) { setError("입실일·퇴실일을 입력해 주세요."); return; }
    if (startDate >= endDate) { setError("퇴실일은 입실일 다음 날 이상이어야 합니다."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/jeju/admin/manual-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          startDate,
          endDate,
          guestName,
          guestPhone,
          guestCount: Number(guestCount) || 1,
          depositorName,
          note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "등록에 실패했습니다.");
        return;
      }
      setResults((prev) => [
        {
          id: data.id,
          nights: data.nights,
          employeeName: selectedEmp?.name ?? "",
          startDate,
          endDate,
          guestName,
          guestCount: Number(guestCount) || 1,
        },
        ...prev,
      ]);
      // 폼 초기화 (신청자·비고만 유지)
      setStartDate("");
      setEndDate("");
      setGuestName("");
      setGuestPhone("");
      setGuestCount(1);
      setDepositorName("");
    } finally {
      setLoading(false);
    }
  }

  function calcNightsDisplay() {
    if (!startDate || !endDate || startDate >= endDate) return null;
    const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
    return Math.round(ms / 86400000);
  }

  const nights = calcNightsDisplay();

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">이관 처리 전용</p>
        <p>시스템 도입 전에 이미 이루어진 예약을 내역으로 남기기 위한 기능입니다.<br />
          등록 즉시 <span className="font-semibold">예약확정 + 입금확인 완료</span> 상태로 저장됩니다.<br />
          날짜 중복 체크는 동일하게 적용됩니다.
        </p>
      </div>

      <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
          <ClipboardList size={17} className="text-blue-500" />
          예약 내역 수동 등록
        </h2>

        {/* 신청자 */}
        <div>
          <label className="label">신청자 <span className="text-red-500">*</span></label>
          <div className="mt-1 space-y-2">
            <input
              type="text"
              placeholder="이름 · 사번 · 팀 · 외부 · 미초대 검색"
              value={empSearch}
              onChange={(e) => setEmpSearch(e.target.value)}
              className="input w-full"
            />
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="input w-full"
              required
              size={Math.min(filteredEmps.length + 1, 7)}
            >
              <option value="">— 신청자 선택 —</option>
              {filteredEmps.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.empNo}){emp.teamName ? ` · ${emp.teamName}` : ""}
                  {externalInviteLabel(emp)}
                </option>
              ))}
            </select>
            {selectedEmp && (
              <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5">
                선택: <span className="font-semibold">{selectedEmp.name}</span>
                {selectedEmp.empNo && ` (${selectedEmp.empNo})`}
                {selectedEmp.teamName && ` · ${selectedEmp.teamName}`}
                {externalInviteLabel(selectedEmp)}
              </p>
            )}
          </div>
        </div>

        {/* 입실일·퇴실일 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">입실일 <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input w-full mt-1"
              required
            />
          </div>
          <div>
            <label className="label">퇴실일 <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="input w-full mt-1"
              required
            />
          </div>
        </div>
        {nights !== null && (
          <p className="text-xs text-blue-700 -mt-2 bg-blue-50 px-3 py-1.5 rounded-lg">
            {nights}박 {nights + 1}일
          </p>
        )}

        {/* 투숙객 정보 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">투숙객 이름 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="예: 홍길동"
              className="input w-full mt-1"
              required
            />
          </div>
          <div>
            <label className="label">투숙객 연락처 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="예: 010-1234-5678"
              className="input w-full mt-1"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">입실 인원 <span className="text-red-500">*</span></label>
            <input
              type="number"
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value === "" ? "" : Number(e.target.value))}
              min={1}
              max={20}
              className="input w-full mt-1"
              required
            />
          </div>
          <div>
            <label className="label">입금자명 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={depositorName}
              onChange={(e) => setDepositorName(e.target.value)}
              placeholder="예: 홍길동"
              className="input w-full mt-1"
              required
            />
          </div>
        </div>

        {/* 비고 */}
        <div>
          <label className="label">비고 / 사유</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="이관 처리"
            className="input w-full mt-1"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full py-3 text-sm font-semibold disabled:opacity-60"
        >
          {loading ? "등록 중..." : "예약 완료 내역으로 등록"}
        </button>
      </form>

      {/* 등록 결과 목록 */}
      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
            <CheckCircle size={15} className="text-green-500" />
            이번 세션 등록 완료 ({results.length}건)
          </h3>
          <div className="space-y-2">
            {results.map((r) => (
              <div key={r.id} className="flex flex-wrap gap-2 items-center text-sm px-3 py-2 bg-green-50 rounded-lg border border-green-100">
                <span className="font-semibold text-gray-800">{r.employeeName}</span>
                <span className="text-gray-500">{r.startDate} ~ {r.endDate}</span>
                <span className="text-gray-500">{r.nights}박</span>
                <span className="text-gray-600">투숙: {r.guestName} {r.guestCount}명</span>
                <span className="text-xs text-green-700 font-medium px-2 py-0.5 bg-green-100 rounded-full">예약확정</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
