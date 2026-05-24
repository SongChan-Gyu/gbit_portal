"use client";

import { useCallback, useEffect, useState } from "react";
import SpotlightTour, { type SpotlightTourStep } from "@/components/ui/SpotlightTour";
import { LEAVE_APPLY_TOUR_REPLAY_EVENT } from "./LeaveApplyHelpButton";

const STEPS: SpotlightTourStep[] = [
  {
    target: '[data-tour="leave-half-kpi"]',
    title: "1. 하프데이 · 하프대체",
    body: (
      <>
        <p>
          요약란에서 <strong>하프데이</strong>·<strong>하프대체</strong> 사용 여부를 확인합니다.
          화살표로 다른 달도 볼 수 있습니다.
        </p>
        <p className="mt-1">
          하프데이는 <strong>수요일 오후</strong>, 해당 월 첫째 주 수요일까지 신청합니다. 승인 전 철회 가능, 승인 후 취소 불가.
        </p>
        <p className="mt-1 text-gray-500 text-xs">
          힐링데이(하프대체)는 해당 하프데이 신청일에 <strong>개인 사유</strong>로 그날 쓰지 못하게 됐을 때 대신 사용할 수 있습니다. 승인 시 <strong>기존 신청된</strong> 하프데이가 자동 취소됩니다.
        </p>
      </>
    ),
    padding: 8,
    highlightMode: "inset",
    cardPosition: "below",
    scrollReset: "top",
    naturalPosition: true,
  },
  {
    target: '[data-tour="leave-type-asset"]',
    title: "2. 자산형 휴가",
    body: (
      <>
        <p>
          <strong className="text-emerald-700">자산형</strong>은 연차·돌봄·근속·직무부서 등{" "}
          <strong>부여된 일수에서 차감</strong>되는 휴가입니다.
        </p>
        <p className="text-gray-500 text-xs">잔여·조건이 맞는 유형만 버튼에 표시됩니다.</p>
      </>
    ),
    padding: 10,
    highlightMode: "inset",
    highlightTone: "emerald",
  },
  {
    target: '[data-tour="leave-type-reason"]',
    title: "3. 사유형 휴가",
    body: (
      <>
        <p>
          <strong className="text-amber-800">사유형</strong>은 공가·병가·인정휴가 등{" "}
          <strong>사유를 함께 제출</strong>하는 휴가입니다.
        </p>
        <p className="text-gray-500 text-xs">연차 잔여와 무관하게 신청할 수 있는 유형입니다.</p>
      </>
    ),
    padding: 10,
    highlightMode: "inset",
    highlightTone: "amber",
  },
  {
    target: '[data-tour="leave-unit"]',
    title: "4. 신청 단위",
    body: (
      <>
        <p>유형을 고른 뒤 <strong>종일(기간)</strong>, <strong>오전 반차</strong>, <strong>오후 반차</strong> 중 선택합니다.</p>
        <p className="text-gray-500 text-xs">
          하프데이·생일반차 등 일부 유형은 단위가 고정되거나, 세부 유형(하프데이/하프대체)을 고릅니다.
        </p>
      </>
    ),
  },
  {
    target: '[data-tour="leave-dates"]',
    title: "5. 신청 기간",
    body: (
      <>
        <p>달력에서 <strong>시작일·종료일</strong>을 고릅니다. 반차·하프데이는 하루만 선택합니다.</p>
        <p className="text-gray-500 text-xs">선택한 일정과 겹치는 유효 부여만 차감·집계됩니다.</p>
      </>
    ),
  },
  {
    target: '[data-tour="leave-add-item"]',
    title: "6. 복수 신청",
    body: (
      <>
        <p>
          <strong>항목 추가</strong>로 여러 휴가를 한 번에 담을 수 있습니다.
        </p>
        <p className="text-gray-500 text-xs">예: 오전 반차 + 오후 인정휴가를 한 건으로 제출</p>
      </>
    ),
  },
];

export default function LeaveApplyFeatureTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const openTour = useCallback((fromStep = 0) => {
    setStep(fromStep);
    setVisible(true);
    const main = document.querySelector("main");
    if (main) main.scrollTop = 0;
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const res = await fetch("/api/me/feature-tours/leave_apply");
      if (!res.ok || cancel) return;
      const data = (await res.json()) as { seen?: boolean };
      if (!data.seen && !cancel) openTour(0);
    })();
    return () => {
      cancel = true;
    };
  }, [openTour]);

  useEffect(() => {
    const onReplay = () => openTour(0);
    window.addEventListener(LEAVE_APPLY_TOUR_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(LEAVE_APPLY_TOUR_REPLAY_EVENT, onReplay);
  }, [openTour]);

  async function finish(action: "complete" | "skip") {
    setBusy(true);
    try {
      await fetch("/api/me/feature-tours/leave_apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setVisible(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SpotlightTour
      steps={STEPS}
      open={visible}
      step={step}
      onStepChange={(next) => {
        if (next >= 0 && next < STEPS.length) setStep(next);
      }}
      onComplete={() => void finish("complete")}
      onSkip={() => void finish("skip")}
      busy={busy}
    />
  );
}
