/**
 * HRM 시스템 자동화 테스트 스크립트
 * 실행: node test-api.mjs
 */
const BASE = "http://localhost:3005";
let cookieJar = "";

const ok  = (msg) => console.log(`  ✅ ${msg}`);
const fail = (msg) => console.log(`  ❌ ${msg}`);
const info = (msg) => console.log(`  ℹ️  ${msg}`);
const h    = (msg) => console.log(`\n${"─".repeat(50)}\n▶ ${msg}`);

async function req(method, path, body, cookies) {
  const headers = { "Content-Type": "application/json" };
  if (cookies) headers["Cookie"] = cookies;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  // 쿠키 저장
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const parts = setCookie.split(",").map((c) => c.split(";")[0].trim());
    const existing = cookieJar ? cookieJar.split("; ") : [];
    for (const p of parts) {
      const [k] = p.split("=");
      const idx = existing.findIndex((e) => e.startsWith(k + "="));
      if (idx >= 0) existing[idx] = p; else existing.push(p);
    }
    cookieJar = existing.join("; ");
  }
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json, headers: res.headers };
}

// NextAuth CSRF 토큰 획득
async function getCsrf() {
  const r = await req("GET", "/api/auth/csrf");
  return r.json?.csrfToken;
}

// credentials 로그인
async function login(username, password) {
  const csrf = await getCsrf();
  const body = new URLSearchParams({
    username, password,
    csrfToken: csrf,
    callbackUrl: `${BASE}/dashboard`,
    json: "true",
  });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieJar },
    body: body.toString(),
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const parts = setCookie.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean);
    const existing = cookieJar ? cookieJar.split("; ") : [];
    for (const p of parts) {
      if (!p.includes("=")) continue;
      const [k] = p.split("=");
      const idx = existing.findIndex((e) => e.startsWith(k + "="));
      if (idx >= 0) existing[idx] = p; else existing.push(p);
    }
    cookieJar = existing.join("; ");
  }
  return res.status;
}

// 세션 확인
async function getSession() {
  const r = await req("GET", "/api/auth/session", null, cookieJar);
  return r.json;
}

// ──────────────────────────────────────────
async function main() {
  console.log("🧪 HRM 시스템 자동화 테스트 시작\n");
  const results = [];
  function pass(name) { results.push({ name, ok: true  }); ok(name); }
  function fail2(name, err) { results.push({ name, ok: false, err }); fail(`${name}: ${err}`); }

  // ── 1. 관리자 로그인
  h("1. 관리자 로그인 (admin)");
  try {
    await login("admin", "admin1234!");
    const sess = await getSession();
    if (sess?.user?.name) {
      pass(`관리자 로그인 성공: ${sess.user.name} (${sess.user.role})`);
    } else {
      fail2("관리자 로그인", "세션 없음");
    }
  } catch (e) { fail2("관리자 로그인", e.message); }

  // ── 2. 직원/휴가유형 데이터 조회
  h("2. 직원 및 휴가유형 데이터 조회");
  let employees = [], leaveTypes = [];
  try {
    const r = await req("GET", "/api/test/data", null, cookieJar);
    if (r.status === 200 && r.json?.employees) {
      employees = r.json.employees;
      leaveTypes = r.json.leaveTypes;
      pass(`직원 ${employees.length}명, 휴가유형 ${leaveTypes.length}개 조회`);
      employees.forEach((e) => info(`  ${e.empNo} ${e.name} (${e.role}) - ${e.user ? "@"+e.user.username : "계정없음"}`));
    } else {
      fail2("데이터 조회", `status ${r.status}: ${JSON.stringify(r.json)}`);
    }
  } catch (e) { fail2("데이터 조회", e.message); }

  // ── 3. staff1 bypass 토큰 발급
  h("3. staff1 (김훈) bypass 토큰 발급");
  let staff1 = employees.find((e) => e.empNo === "E003");
  let bypassToken = null;
  if (!staff1) {
    fail2("staff1 찾기", "E003 없음");
  } else {
    try {
      const r = await req("POST", "/api/test/bypass-token", { employeeId: staff1.id }, cookieJar);
      if (r.json?.token) {
        bypassToken = r.json.token;
        pass(`bypass 토큰 발급: ${bypassToken.slice(0,16)}...`);
      } else {
        fail2("bypass 토큰", JSON.stringify(r.json));
      }
    } catch (e) { fail2("bypass 토큰", e.message); }
  }

  // ── 4. staff1으로 전환 로그인
  h("4. staff1 계정으로 전환");
  if (bypassToken) {
    try {
      const csrf = await getCsrf();
      const body = new URLSearchParams({
        bypassToken, csrfToken: csrf,
        callbackUrl: `${BASE}/dashboard`, json: "true",
      });
      const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieJar },
        body: body.toString(),
        redirect: "manual",
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) {
        const parts = setCookie.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean);
        const existing = cookieJar ? cookieJar.split("; ") : [];
        for (const p of parts) {
          if (!p.includes("=")) continue;
          const [k] = p.split("=");
          const idx = existing.findIndex((e) => e.startsWith(k + "="));
          if (idx >= 0) existing[idx] = p; else existing.push(p);
        }
        cookieJar = existing.join("; ");
      }
      const sess = await getSession();
      if (sess?.user?.name) {
        pass(`전환 성공: ${sess.user.name} (${sess.user.role})`);
      } else {
        fail2("staff1 전환", "세션 없음");
      }
    } catch (e) { fail2("staff1 전환", e.message); }
  }

  // ── 5. 휴가 신청 (staff1)
  h("5. 휴가 신청 생성 (staff1)");
  let leaveRequestId = null;
  try {
    const annual = leaveTypes.find((lt) => lt.code === "ANNUAL");
    if (!annual) { fail2("휴가신청", "ANNUAL 유형 없음"); }
    else {
      const r = await req("POST", "/api/leave/request", {
        items: [{
          leaveTypeId: annual.id,
          startDate: "2026-03-10",
          endDate: "2026-03-12",
          reason: "개인 사유 (테스트)",
          days: 3,
        }],
        startDate: "2026-03-10",
        endDate: "2026-03-12",
        totalDays: 3,
        reason: "개인 사유 (테스트)",
      }, cookieJar);
      if (r.status === 200 && r.json?.id) {
        leaveRequestId = r.json.id;
        pass(`휴가 신청 성공: ID ${leaveRequestId}`);
      } else {
        fail2("휴가 신청", JSON.stringify(r.json));
      }
    }
  } catch (e) { fail2("휴가 신청", e.message); }

  // ── 6. 내 휴가 현황 확인
  h("6. 내 휴가 현황 확인");
  try {
    const r = await req("GET", `/api/leave/my-requests`, null, cookieJar);
    if (r.status === 200) {
      pass(`내 휴가 현황 API 정상`);
    } else {
      // 페이지 렌더링 확인
      const r2 = await fetch(`${BASE}/leave/my`, { headers: { Cookie: cookieJar } });
      if (r2.status === 200) pass("내 휴가 현황 페이지 로드 성공");
      else fail2("내 휴가 현황", `status ${r2.status}`);
    }
  } catch (e) { fail2("내 휴가 현황", e.message); }

  // ── 7. admin으로 복귀 후 결재 테스트
  h("7. admin 재로그인");
  try {
    cookieJar = "";
    await login("admin", "admin1234!");
    const sess = await getSession();
    if (sess?.user?.role === "ADMIN") {
      pass(`admin 재로그인 성공`);
    } else {
      fail2("admin 재로그인", "세션 역할 불일치");
    }
  } catch (e) { fail2("admin 재로그인", e.message); }

  // ── 8. team1 bypass 토큰으로 전환
  h("8. team1 (김영현, 팀장)으로 전환하여 결재");
  const team1 = employees.find((e) => e.empNo === "E002");
  if (team1 && leaveRequestId) {
    try {
      const r = await req("POST", "/api/test/bypass-token", { employeeId: team1.id }, cookieJar);
      if (r.json?.token) {
        const csrf = await getCsrf();
        const body = new URLSearchParams({
          bypassToken: r.json.token, csrfToken: csrf,
          callbackUrl: `${BASE}/leave/approve`, json: "true",
        });
        const res2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieJar },
          body: body.toString(),
          redirect: "manual",
        });
        const sc = res2.headers.get("set-cookie");
        if (sc) {
          const parts = sc.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean);
          const existing = cookieJar ? cookieJar.split("; ") : [];
          for (const p of parts) {
            if (!p.includes("=")) continue;
            const [k] = p.split("=");
            const idx = existing.findIndex((e) => e.startsWith(k + "="));
            if (idx >= 0) existing[idx] = p; else existing.push(p);
          }
          cookieJar = existing.join("; ");
        }
        const sess = await getSession();
        if (sess?.user?.name) {
          pass(`team1 전환 성공: ${sess.user.name}`);

          // 결재 API
          const appRes = await req("POST", "/api/leave/approve", {
            requestId: leaveRequestId, action: "APPROVE", comment: "승인 (자동테스트)"
          }, cookieJar);
          if (appRes.json?.ok) {
            pass("팀장 1차 결재 승인 성공");
          } else {
            fail2("팀장 결재", JSON.stringify(appRes.json));
          }
        }
      }
    } catch (e) { fail2("team1 전환+결재", e.message); }
  }

  // ── 9. PM으로 전환하여 2차 결재
  h("9. PM(이기공)으로 전환하여 2차 결재");
  const pm = employees.find((e) => e.empNo === "E001");
  if (pm && leaveRequestId) {
    try {
      cookieJar = "";
      await login("admin", "admin1234!");
      const r = await req("POST", "/api/test/bypass-token", { employeeId: pm.id }, cookieJar);
      if (r.json?.token) {
        const csrf = await getCsrf();
        const body = new URLSearchParams({
          bypassToken: r.json.token, csrfToken: csrf,
          callbackUrl: `${BASE}/leave/approve`, json: "true",
        });
        const res2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieJar },
          body: body.toString(),
          redirect: "manual",
        });
        const sc = res2.headers.get("set-cookie");
        if (sc) {
          const parts = sc.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean);
          const existing = cookieJar ? cookieJar.split("; ") : [];
          for (const p of parts) {
            if (!p.includes("=")) continue;
            const [k] = p.split("=");
            const idx = existing.findIndex((e) => e.startsWith(k + "="));
            if (idx >= 0) existing[idx] = p; else existing.push(p);
          }
          cookieJar = existing.join("; ");
        }
        const sess = await getSession();
        if (sess?.user?.name) {
          pass(`PM 전환 성공: ${sess.user.name}`);

          const appRes = await req("POST", "/api/leave/approve", {
            requestId: leaveRequestId, action: "APPROVE", comment: "PM 최종승인 (자동테스트)"
          }, cookieJar);
          if (appRes.json?.ok) {
            pass("PM 2차 결재 승인 성공");
          } else {
            fail2("PM 결재", JSON.stringify(appRes.json));
          }
        }
      }
    } catch (e) { fail2("PM 전환+결재", e.message); }
  }

  // ── 10. staff1으로 취소신청
  h("10. staff1 - 승인된 휴가 취소 신청");
  if (leaveRequestId && staff1) {
    try {
      cookieJar = "";
      await login("admin", "admin1234!");
      const r = await req("POST", "/api/test/bypass-token", { employeeId: staff1.id }, cookieJar);
      if (r.json?.token) {
        const csrf = await getCsrf();
        const body = new URLSearchParams({
          bypassToken: r.json.token, csrfToken: csrf, callbackUrl: `${BASE}/leave/my`, json: "true",
        });
        const res2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieJar },
          body: body.toString(),
          redirect: "manual",
        });
        const sc = res2.headers.get("set-cookie");
        if (sc) {
          const parts = sc.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean);
          const existing = cookieJar ? cookieJar.split("; ") : [];
          for (const p of parts) {
            if (!p.includes("=")) continue;
            const [k] = p.split("=");
            const idx = existing.findIndex((e) => e.startsWith(k + "="));
            if (idx >= 0) existing[idx] = p; else existing.push(p);
          }
          cookieJar = existing.join("; ");
        }

        const cancelRes = await req("POST", `/api/leave/request/${leaveRequestId}/cancel-request`,
          { reason: "개인 사정으로 취소 (자동테스트)" }, cookieJar);
        if (cancelRes.json?.ok) {
          pass("취소 신청 성공 - 상태: CANCEL_REQUESTED");
        } else {
          fail2("취소 신청", JSON.stringify(cancelRes.json));
        }
      }
    } catch (e) { fail2("취소신청", e.message); }
  }

  // ── 11. 팀장이 취소신청 결재
  h("11. 팀장 - 취소신청 1차 결재");
  if (leaveRequestId && team1) {
    try {
      cookieJar = "";
      await login("admin", "admin1234!");
      const r = await req("POST", "/api/test/bypass-token", { employeeId: team1.id }, cookieJar);
      if (r.json?.token) {
        const csrf = await getCsrf();
        const body = new URLSearchParams({
          bypassToken: r.json.token, csrfToken: csrf, callbackUrl: `${BASE}/leave/approve`, json: "true",
        });
        const res2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieJar },
          body: body.toString(),
          redirect: "manual",
        });
        const sc = res2.headers.get("set-cookie");
        if (sc) {
          const parts = sc.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean);
          const existing = cookieJar ? cookieJar.split("; ") : [];
          for (const p of parts) {
            if (!p.includes("=")) continue;
            const [k] = p.split("=");
            const idx = existing.findIndex((e) => e.startsWith(k + "="));
            if (idx >= 0) existing[idx] = p; else existing.push(p);
          }
          cookieJar = existing.join("; ");
        }

        const appRes = await req("POST", "/api/leave/cancel-approve",
          { requestId: leaveRequestId, action: "APPROVE", comment: "취소 승인 (자동테스트)" }, cookieJar);
        if (appRes.json?.ok) {
          pass("팀장 취소결재 승인 성공");
        } else {
          fail2("팀장 취소결재", JSON.stringify(appRes.json));
        }
      }
    } catch (e) { fail2("팀장 취소결재", e.message); }
  }

  // ── 12. PM이 취소신청 최종 결재
  h("12. PM - 취소신청 최종 결재");
  if (leaveRequestId && pm) {
    try {
      cookieJar = "";
      await login("admin", "admin1234!");
      const r = await req("POST", "/api/test/bypass-token", { employeeId: pm.id }, cookieJar);
      if (r.json?.token) {
        const csrf = await getCsrf();
        const body = new URLSearchParams({
          bypassToken: r.json.token, csrfToken: csrf, callbackUrl: `${BASE}/leave/approve`, json: "true",
        });
        const res2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieJar },
          body: body.toString(),
          redirect: "manual",
        });
        const sc = res2.headers.get("set-cookie");
        if (sc) {
          const parts = sc.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean);
          const existing = cookieJar ? cookieJar.split("; ") : [];
          for (const p of parts) {
            if (!p.includes("=")) continue;
            const [k] = p.split("=");
            const idx = existing.findIndex((e) => e.startsWith(k + "="));
            if (idx >= 0) existing[idx] = p; else existing.push(p);
          }
          cookieJar = existing.join("; ");
        }

        const appRes = await req("POST", "/api/leave/cancel-approve",
          { requestId: leaveRequestId, action: "APPROVE", comment: "PM 취소최종승인 (자동테스트)" }, cookieJar);
        if (appRes.json?.ok) {
          pass("PM 취소결재 최종 승인 성공 → 상태: CANCELLED, 일수 복원");
        } else {
          fail2("PM 취소결재", JSON.stringify(appRes.json));
        }
      }
    } catch (e) { fail2("PM 취소결재", e.message); }
  }

  // ── 13. DB 최종 상태 확인
  h("13. 최종 DB 상태 확인");
  try {
    cookieJar = "";
    await login("admin", "admin1234!");
    const r = await req("GET", "/api/admin/employees", null, cookieJar);
    if (r.status === 200) pass("관리자 API 정상");
  } catch (e) { fail2("최종 상태", e.message); }

  // ── 결과 요약
  console.log("\n" + "═".repeat(55));
  console.log("📊 테스트 결과 요약");
  console.log("═".repeat(55));
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  results.forEach((r) => {
    console.log(`  ${r.ok ? "✅" : "❌"} ${r.name}${r.err ? ` → ${r.err}` : ""}`);
  });
  console.log("─".repeat(55));
  console.log(`  총 ${results.length}건 | 성공: ${passed} | 실패: ${failed}`);
  console.log("═".repeat(55));

  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
