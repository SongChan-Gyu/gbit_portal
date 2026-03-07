"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { ArrowLeftCircle, UserCheck } from "lucide-react";

interface SwitchedFrom {
  empId: string;
  name: string;
  token: string;
}

export default function ImpersonationBanner() {
  const { data: session } = useSession();
  const [switchedFrom, setSwitchedFrom] = useState<SwitchedFrom | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("hrm_switched_from");
      if (!raw) { setSwitchedFrom(null); return; }
      const parsed: SwitchedFrom = JSON.parse(raw);
      // 현재 세션이 원래 계정이면 배너 숨기기
      const su = session?.user as any;
      if (su?.employeeId && su.employeeId === parsed.empId) {
        localStorage.removeItem("hrm_switched_from");
        setSwitchedFrom(null);
      } else {
        setSwitchedFrom(parsed);
      }
    } catch {
      setSwitchedFrom(null);
    }
  }, [session]);

  if (!switchedFrom) return null;

  const handleReturn = async () => {
    setLoading(true);
    try {
      // 미리 저장해둔 토큰으로 원래 계정으로 복귀 (추가 API 호출 불필요)
      const result = await signIn("credentials", {
        bypassToken: switchedFrom.token,
        redirect: false,
      });
      if (result?.error) {
        // 토큰 만료 시 새로 발급 시도 (현재 사용자가 admin인 경우 가능)
        alert("토큰이 만료되었습니다. 다시 로그인해주세요.");
        return;
      }
      localStorage.removeItem("hrm_switched_from");
      window.location.href = "/test/user-switch";
    } catch {
      alert("돌아가기 실패");
    } finally {
      setLoading(false);
    }
  };

  // 문서 흐름에 배치해 메뉴(헤더·사이드바)를 덮지 않음 (모바일에서 햄버거 메뉴 가림 방지)
  return (
    <div
      className="bg-amber-500 text-white text-sm flex items-center justify-between px-4 py-1.5 shadow-md shrink-0"
    >
      <span className="flex items-center gap-2">
        <UserCheck size={15} />
        <strong>{session?.user?.name ?? "..."}</strong> 계정으로 전환 중
        <span className="opacity-75 text-xs">(원래: {switchedFrom.name})</span>
      </span>
      <button
        onClick={handleReturn}
        disabled={loading}
        className="flex items-center gap-1.5 bg-white text-amber-700 rounded px-2.5 py-0.5 font-semibold text-xs hover:bg-amber-50 disabled:opacity-60 transition"
      >
        <ArrowLeftCircle size={13} />
        {loading ? "전환 중..." : `${switchedFrom.name} 계정으로 돌아가기`}
      </button>
    </div>
  );
}
