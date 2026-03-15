"use client";

import { useEffect, useRef, useState } from "react";

/** 제주도 숙소(고도17) 위경도 - 제주시 한경면 고산로2길 10 */
const JEJU_LAT = 33.3192;
const JEJU_LNG = 126.2619;

const KAKAO_MAP_URL = "https://map.kakao.com/link/search/제주특별자치도%20제주시%20한경면%20고산로2길%2010";

declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (callback: () => void) => void;
        LatLng: new (lat: number, lng: number) => unknown;
        Map: new (el: HTMLElement, opt: { center: unknown; level: number }) => unknown;
        Marker: new (opt: { position: unknown; map?: unknown }) => { setMap: (map: unknown) => void };
      };
    };
  }
}

const MAP_CONTAINER_ID = "jeju-map-container";

export default function JejuMap() {
  const initedRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY;
    if (!key || !key.trim()) {
      setLoadError("키 없음");
      return;
    }

    const initMap = () => {
      const kakao = window.kakao;
      if (!kakao?.maps || initedRef.current) return;
      const container = document.getElementById(MAP_CONTAINER_ID);
      if (!container) return;
      initedRef.current = true;
      try {
        const center = new kakao.maps.LatLng(JEJU_LAT, JEJU_LNG);
        const map = new kakao.maps.Map(container, { center, level: 3 });
        const marker = new kakao.maps.Marker({ position: center });
        marker.setMap(map);
        setLoadError(null);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "지도 로드 실패");
      }
    };

    if (window.kakao?.maps) {
      window.kakao.maps.load(initMap);
      return;
    }

    const existing = document.querySelector('script[src*="dapi.kakao.com/v2/maps/sdk.js"]');
    if (existing) {
      const check = setInterval(() => {
        if (window.kakao?.maps) {
          clearInterval(check);
          window.kakao.maps.load(initMap);
        }
      }, 100);
      return () => clearInterval(check);
    }

    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    script.async = true;
    script.onload = () => {
      if (window.kakao?.maps) {
        window.kakao.maps.load(initMap);
      }
    };
    script.onerror = () => setLoadError("스크립트 로드 실패");
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  const hasKey = !!process.env.NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY?.trim();

  if (!hasKey) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
        <p className="text-sm text-gray-600 mb-2">제주특별자치도 제주시 한경면 고산로2길 10 (고도 17)</p>
        <a
          href={KAKAO_MAP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          카카오 지도에서 보기 →
        </a>
        <p className="text-xs text-gray-400 mt-3">
          배포 환경에서 지도를 표시하려면{" "}
          <a href="https://developers.kakao.com" target="_blank" rel="noopener noreferrer" className="underline">Kakao Developers</a>
          에서 앱을 만들고 <strong>JavaScript 키</strong>를 발급받은 뒤
          <br />
          <code className="bg-gray-200 px-1 rounded">NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY</code>에 설정하고, 플랫폼에 웹 도메인을 등록해 주세요. (무료 한도: 일 30만 건)
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        id={MAP_CONTAINER_ID}
        className="w-full h-[280px] rounded-lg overflow-hidden border border-gray-200 bg-gray-100"
        aria-label="제주도 숙소 위치 지도"
      />
      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-gray-50 border border-gray-200 p-4 text-center">
          <p className="text-sm text-amber-700 mb-2">지도를 불러오지 못했습니다.</p>
          <a href={KAKAO_MAP_URL} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-600 hover:underline">
            카카오 지도에서 보기 →
          </a>
          <p className="text-xs text-gray-500 mt-2">localhost를 Kakao Developers 플랫폼 Web에 등록했는지 확인해 주세요.</p>
        </div>
      )}
    </div>
  );
}
