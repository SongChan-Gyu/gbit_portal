"use client";

import { useCallback, useEffect, useState } from "react";
import LoginAnnouncementModal, {
  type LoginAnnouncementPayload,
} from "@/components/login-announcement/LoginAnnouncementModal";
import {
  isLoginAnnouncementSessionDismissed,
  markLoginAnnouncementSessionDismissed,
} from "@/lib/loginAnnouncementSession";

export default function LoginAnnouncementGate() {
  const [data, setData] = useState<LoginAnnouncementPayload | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const res = await fetch("/api/me/login-announcement");
      if (!res.ok || cancel) return;
      const json = (await res.json()) as LoginAnnouncementPayload | null;
      if (!json?.id || cancel) return;
      if (isLoginAnnouncementSessionDismissed(json.id)) return;
      setData(json);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const dismissWeek = useCallback(async () => {
    if (!data) return;
    setBusy(true);
    try {
      await fetch("/api/me/login-announcement/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ announcementId: data.id, dismissType: "WEEK" }),
      });
      markLoginAnnouncementSessionDismissed(data.id);
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [data]);

  const dismissClose = useCallback(() => {
    if (!data) return;
    // 확인: 이번 로그인 세션에서만 닫음. 로그아웃 후 재로그인 시 다시 표시.
    markLoginAnnouncementSessionDismissed(data.id);
    setData(null);
  }, [data]);

  if (!data) return null;

  return (
    <LoginAnnouncementModal
      data={data}
      busy={busy}
      onDismissClose={dismissClose}
      onDismissWeek={() => void dismissWeek()}
    />
  );
}
