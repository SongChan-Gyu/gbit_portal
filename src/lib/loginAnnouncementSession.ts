const SESSION_DISMISS_PREFIX = "login-announce-dismiss:";

export function isLoginAnnouncementSessionDismissed(announcementId: string): boolean {
  try {
    return sessionStorage.getItem(`${SESSION_DISMISS_PREFIX}${announcementId}`) === "1";
  } catch {
    return false;
  }
}

export function markLoginAnnouncementSessionDismissed(announcementId: string) {
  try {
    sessionStorage.setItem(`${SESSION_DISMISS_PREFIX}${announcementId}`, "1");
  } catch {
    /* private mode 등 */
  }
}

/** 로그아웃·재로그인 시 팝업을 다시 보여 주기 위해 세션 닫기 기록 제거 */
export function clearLoginAnnouncementSessionDismissals() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(SESSION_DISMISS_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
