"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, X } from "lucide-react";

export type HighlightTone = "indigo" | "emerald" | "amber";

export type SpotlightTourStep = {
  target: string;
  title: string;
  body: React.ReactNode;
  padding?: number;
  maxHighlightH?: number;
  /** 기본 above: 카드가 하이라이트 위. below: 하이라이트 아래(상단 KPI 등) */
  cardPosition?: "above" | "below";
  /** ring: 고정 테두리. inset: 타깃 요소에 직접 링 (긴 섹션·모바일 권장) */
  highlightMode?: "ring" | "inset";
  highlightTone?: HighlightTone;
  /** 스크롤 컨테이너를 맨 위로 — 상단 KPI 단계용 */
  scrollReset?: "top";
  /** 타깃을 강제로 끌어올리지 않고 현재 위치 기준 배치 */
  naturalPosition?: boolean;
};

const HIGHLIGHT_TONE_CLASSES: Record<HighlightTone, string[]> = {
  indigo: ["ring-2", "ring-indigo-500/90", "ring-offset-2", "rounded-lg", "relative", "z-[201]", "shadow-md", "shadow-indigo-500/15"],
  emerald: ["ring-2", "ring-emerald-500/90", "ring-offset-2", "rounded-xl", "relative", "z-[201]", "shadow-md", "shadow-emerald-500/15"],
  amber: ["ring-2", "ring-amber-500/90", "ring-offset-2", "rounded-xl", "relative", "z-[201]", "shadow-md", "shadow-amber-500/15"],
};

function allHighlightClasses(): string[] {
  return Object.values(HIGHLIGHT_TONE_CLASSES).flat();
}

function applyTargetHighlight(el: Element, tone: HighlightTone) {
  el.classList.add(...HIGHLIGHT_TONE_CLASSES[tone]);
}

function clearTargetHighlight(el: Element | null) {
  if (!el) return;
  el.classList.remove(...allHighlightClasses());
}

type Rect = { top: number; left: number; width: number; height: number };
type CardLayout = { top: number; height: number };
type TourLayout = { highlight: Rect; card: CardLayout; cardPosition: "above" | "below" };

type Props = {
  steps: SpotlightTourStep[];
  open: boolean;
  step: number;
  onStepChange: (next: number) => void;
  onComplete: () => void;
  onSkip: () => void;
  busy?: boolean;
};

const MARGIN = 12;
const GAP = 10;
const CARD_MIN = 220;
const CARD_MAX = 520;
const TOUR_TOP = 6;

function viewportHeight() {
  return window.visualViewport?.height ?? window.innerHeight;
}

function getContentTopAnchor(): number {
  const main = document.querySelector("main");
  if (main) return Math.max(TOUR_TOP, main.getBoundingClientRect().top + TOUR_TOP);
  const header = document.querySelector("header");
  if (header) return header.getBoundingClientRect().bottom + TOUR_TOP;
  return TOUR_TOP + 48;
}

function getScrollParent(el: Element): HTMLElement {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      if (node.scrollHeight > node.clientHeight + 1) return node;
    }
    node = node.parentElement;
  }
  return document.documentElement;
}

function measureTarget(selector: string, padding: number, maxH?: number): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  const height = maxH ? Math.min(r.height + padding * 2, maxH) : r.height + padding * 2;
  return {
    top: r.top - padding,
    left: Math.max(MARGIN, r.left - padding),
    width: Math.min(window.innerWidth - MARGIN * 2, r.width + padding * 2),
    height,
  };
}

function scrollElementTopTo(el: Element, viewportTop: number) {
  const scrollParent = getScrollParent(el);
  const delta = el.getBoundingClientRect().top - viewportTop;
  if (Math.abs(delta) < 1) return;
  scrollParent.scrollTop += delta;
}

function settleScroll(el: Element, viewportTop: number, passes = 4) {
  for (let i = 0; i < passes; i += 1) {
    scrollElementTopTo(el, viewportTop);
  }
}

function clipHighlightToViewport(highlight: Rect, vh: number): Rect {
  const bottom = vh - MARGIN;
  if (highlight.top >= bottom) {
    return { ...highlight, top: bottom - 48, height: 48 };
  }
  const visibleH = bottom - highlight.top;
  if (highlight.height > visibleH) {
    return { ...highlight, height: Math.max(48, visibleH) };
  }
  return highlight;
}

function placeCard(
  highlight: Rect,
  preferred: "above" | "below",
  topAnchor: number,
  vh: number,
): { top: number; height: number; position: "above" | "below" } {
  const bottomLimit = vh - MARGIN;
  const spaceAbove = highlight.top - topAnchor - GAP;
  const spaceBelow = bottomLimit - (highlight.top + highlight.height) - GAP;

  let position = preferred;
  if (position === "below" && spaceBelow < CARD_MIN && spaceAbove >= CARD_MIN) {
    position = "above";
  } else if (position === "above" && spaceAbove < CARD_MIN && spaceBelow >= CARD_MIN) {
    position = "below";
  } else if (position === "below" && spaceBelow < spaceAbove) {
    position = "above";
  } else if (position === "above" && spaceAbove < spaceBelow) {
    position = "below";
  }

  if (position === "above") {
    const height = Math.max(CARD_MIN, Math.min(CARD_MAX, spaceAbove));
    return { top: topAnchor, height, position };
  }

  const top = highlight.top + highlight.height + GAP;
  const height = Math.max(CARD_MIN, Math.min(CARD_MAX, bottomLimit - top));
  return { top, height, position: "below" };
}

function buildLayout(cfg: SpotlightTourStep, topAnchor: number): TourLayout | null {
  const raw = measureTarget(cfg.target, cfg.padding ?? 8, cfg.maxHighlightH);
  if (!raw) return null;

  const vh = viewportHeight();
  const highlight = clipHighlightToViewport(raw, vh);
  const preferred = cfg.cardPosition ?? "above";
  const card = placeCard(highlight, preferred, topAnchor, vh);

  return {
    card: { top: card.top, height: card.height },
    highlight,
    cardPosition: card.position,
  };
}

function DimPanels({ rect }: { rect: Rect }) {
  const dim = "fixed z-[200] bg-slate-900/58 pointer-events-none";
  const vh = viewportHeight();
  const vw = window.innerWidth;
  return (
    <>
      <div className={dim} style={{ top: 0, left: 0, width: vw, height: Math.max(0, rect.top) }} />
      <div className={dim} style={{ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height }} />
      <div
        className={dim}
        style={{
          top: rect.top,
          left: rect.left + rect.width,
          width: Math.max(0, vw - rect.left - rect.width),
          height: rect.height,
        }}
      />
      <div
        className={dim}
        style={{ top: rect.top + rect.height, left: 0, width: vw, height: Math.max(0, vh - rect.top - rect.height) }}
      />
    </>
  );
}

function TourCard({
  step,
  total,
  title,
  body,
  isLast,
  busy,
  onNext,
  onComplete,
  onSkip,
  layout,
}: {
  step: number;
  total: number;
  title: string;
  body: React.ReactNode;
  isLast: boolean;
  busy: boolean;
  onNext: (e: React.MouseEvent) => void;
  onComplete: () => void;
  onSkip: () => void;
  layout: CardLayout;
}) {
  return (
    <div
      className="fixed z-[202] inset-x-3 flex flex-col overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-2xl shadow-indigo-950/25"
      style={{ top: layout.top, height: layout.height }}
    >
      <div className="shrink-0 px-3.5 pt-2.5 pb-1.5 border-b border-indigo-100/80 bg-indigo-50/50">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
            안내 · {step + 1}/{total}
          </p>
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className="text-gray-400 hover:text-gray-600 p-0.5 rounded-md shrink-0 -mt-0.5"
            aria-label="닫기"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <h3 id="spotlight-tour-title" className="text-sm font-bold text-gray-900 leading-snug mt-0.5">
          {title}
        </h3>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3.5 py-2">
        <div className="text-[13px] text-gray-600 leading-relaxed space-y-1.5">{body}</div>
      </div>

      <div className="shrink-0 border-t border-gray-100 bg-white px-3 py-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-1.5 flex-wrap">
          {!isLast ? (
            <button
              type="button"
              disabled={busy}
              onClick={onNext}
              className="inline-flex items-center justify-center gap-0.5 h-8 px-3 text-xs font-medium rounded-md bg-slate-600 text-white hover:bg-slate-700 active:bg-slate-800 disabled:opacity-40 touch-manipulation"
            >
              다음 <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onComplete}
              className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium rounded-md bg-slate-600 text-white hover:bg-slate-700 active:bg-slate-800 disabled:opacity-40 touch-manipulation"
            >
              확인했습니다
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onSkip}
            className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium rounded-md border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 touch-manipulation"
          >
            다시 보지 않기
          </button>
          <div className="flex gap-1 ml-auto">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all ${i === step ? "w-4 bg-indigo-500" : "w-1 bg-indigo-200"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SpotlightTour({
  steps,
  open,
  step,
  onStepChange,
  onComplete,
  onSkip,
  busy = false,
}: Props) {
  const [layout, setLayout] = useState<TourLayout | null>(null);
  const stepsRef = useRef(steps);
  const lockingRef = useRef(false);
  const scrollParentRef = useRef<HTMLElement | null>(null);
  const layoutRef = useRef<TourLayout | null>(null);
  const highlightedElRef = useRef<Element | null>(null);

  stepsRef.current = steps;
  const current = steps[step] ?? steps[0];
  const isLast = step >= steps.length - 1;

  const layoutStep = useCallback((stepIndex: number, attempt = 0) => {
    const cfg = stepsRef.current[stepIndex];
    if (!open || !cfg) return;

    const el = document.querySelector(cfg.target);
    if (!el) {
      if (attempt < 8) {
        window.setTimeout(() => layoutStep(stepIndex, attempt + 1), 80);
      }
      return;
    }

    lockingRef.current = true;
    const scrollParent = getScrollParent(el);
    scrollParentRef.current = scrollParent;

    if (cfg.scrollReset === "top") {
      scrollParent.scrollTop = 0;
    }

    const topAnchor = getContentTopAnchor();

    const finalize = (pass = 0) => {
      if (!cfg.naturalPosition) {
        const cardReserve =
          pass === 0 ? CARD_MIN : Math.max(CARD_MIN, layoutRef.current?.card.height ?? CARD_MIN);
        settleScroll(el, topAnchor + cardReserve + GAP);
      }

      const next = buildLayout(cfg, topAnchor);
      if (!next) {
        lockingRef.current = false;
        if (attempt < 8) layoutStep(stepIndex, attempt + 1);
        return;
      }

      layoutRef.current = next;
      const measuredTop = el.getBoundingClientRect().top;
      const expectedTop = cfg.naturalPosition ? measuredTop : topAnchor + next.card.height + GAP;
      const drift = cfg.naturalPosition ? 0 : Math.abs(measuredTop - expectedTop);

      if (!cfg.naturalPosition && pass < 2 && drift > 4) {
        requestAnimationFrame(() => finalize(pass + 1));
        return;
      }

      setLayout(next);
      window.setTimeout(() => {
        lockingRef.current = false;
      }, 120);
    };

    requestAnimationFrame(() => finalize(0));
  }, [open]);

  useEffect(() => {
    if (!open) {
      clearTargetHighlight(highlightedElRef.current);
      highlightedElRef.current = null;
      setLayout(null);
      layoutRef.current = null;
      scrollParentRef.current = null;
      return;
    }
    setLayout(null);
    layoutStep(step);
  }, [open, step, layoutStep]);

  useEffect(() => {
    if (!open || !layout) return;

    const cfg = current;
    const el = document.querySelector(cfg.target);
    if (highlightedElRef.current && highlightedElRef.current !== el) {
      clearTargetHighlight(highlightedElRef.current);
      highlightedElRef.current = null;
    }

    const mode = cfg.highlightMode ?? "ring";
    if (mode === "inset" && el) {
      applyTargetHighlight(el, cfg.highlightTone ?? "indigo");
      highlightedElRef.current = el;
    }

    return () => {
      if (highlightedElRef.current === el) {
        clearTargetHighlight(el);
        highlightedElRef.current = null;
      }
    };
  }, [open, step, layout, current]);

  useEffect(() => {
    if (!open) return;

    const onRelayout = () => {
      if (lockingRef.current) return;
      layoutStep(step);
    };

    window.addEventListener("resize", onRelayout);
    window.visualViewport?.addEventListener("resize", onRelayout);

    const cfg = stepsRef.current[step];
    const el = cfg ? document.querySelector(cfg.target) : null;
    const scrollParent = el ? getScrollParent(el) : scrollParentRef.current;
    scrollParent?.addEventListener("scroll", onRelayout, { passive: true });

    return () => {
      window.removeEventListener("resize", onRelayout);
      window.visualViewport?.removeEventListener("resize", onRelayout);
      scrollParent?.removeEventListener("scroll", onRelayout);
    };
  }, [open, step, layoutStep]);

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = step + 1;
    if (next < steps.length) onStepChange(next);
  };

  if (!open || !current || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-labelledby="spotlight-tour-title">
      {layout?.highlight ? (
        <>
          <DimPanels rect={layout.highlight} />
          {(current.highlightMode ?? "ring") === "ring" && (
            <div
              className="pointer-events-none fixed z-[201] rounded-lg border-2 border-indigo-500/90"
              style={{
                top: layout.highlight.top,
                left: layout.highlight.left,
                width: layout.highlight.width,
                height: layout.highlight.height,
                boxShadow: "0 0 0 1px rgba(99,102,241,0.4), 0 4px 16px rgba(99,102,241,0.25)",
              }}
            />
          )}
        </>
      ) : (
        <div className="absolute inset-0 bg-slate-900/58" />
      )}

      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {layout?.card && (
        <TourCard
          step={step}
          total={steps.length}
          title={current.title}
          body={current.body}
          isLast={isLast}
          busy={busy}
          onNext={handleNext}
          onComplete={onComplete}
          onSkip={onSkip}
          layout={layout.card}
        />
      )}
    </div>,
    document.body,
  );
}
