import { afterEach, describe, expect, it, vi } from "vitest";
import {
  alimtalkNoteLayoutVersion,
  directsendNotesForPortalTemplate,
  resolveDirectsendUserTemplateNo,
  sendStampRequestAlimtalk,
  sendStampResultAlimtalk,
} from "./kakao";

const { directsendKakaoAlimtalk } = vi.hoisted(() => ({
  directsendKakaoAlimtalk: vi.fn(),
}));

vi.mock("./directsendKakao", () => ({ directsendKakaoAlimtalk }));

function mockPrisma() {
  return {
    notificationLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

function restoreEnv(backup: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in backup)) delete process.env[key];
  }
  for (const [k, v] of Object.entries(backup)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("STAMP_REQUEST alimtalk", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    restoreEnv(envBackup);
    directsendKakaoAlimtalk.mockReset();
  });

  it("note 매핑(v1): 휴가유형 칸은 스탬프(휴가 아님), 기간 칸은 [스탬프] 서명", () => {
    process.env.ALIMTALK_NOTE_LAYOUT = "v1";
    expect(alimtalkNoteLayoutVersion()).toBe("v1");
    const notes = directsendNotesForPortalTemplate("STAMP_REQUEST", {
      결재자명: "김팀장",
      신청자명: "이직원",
      요청유형: "스탬프(휴가 아님)",
      날짜: "2026-09-03",
      요일: "목",
      사유: "운영반영일 참석",
    });
    expect(notes[2]).toBe("스탬프(휴가 아님)");
    expect(notes[3]).toBe("[스탬프] 팀장 서명 · 2026-09-03(목) · 운영반영일 참석");
    expect(notes[4]).toBe("");
    const leave = directsendNotesForPortalTemplate("LEAVE_REQUEST", {
      결재자명: "김팀장",
      신청자명: "이직원",
      휴가유형: "연차",
      시작일: "2026-09-03",
      시작요일: "목",
      종료일: "2026-09-04",
      종료요일: "금",
    });
    expect(leave[2]).toBe("연차");
    expect(notes[2]).not.toBe(leave[2]);
    expect(notes[3]).not.toBe(leave[3]);
  });

  it("note 매핑(v2): 비고5에 /stamp/approve (휴가 결재함 아님)", () => {
    process.env.ALIMTALK_NOTE_LAYOUT = "v2";
    process.env.NEXTAUTH_URL = "https://www.gbitportal.co.kr";
    const notes = directsendNotesForPortalTemplate("STAMP_REQUEST", {
      결재자명: "김팀장",
      신청자명: "이직원",
      요청유형: "스탬프(휴가 아님)",
      날짜: "2026-09-03",
      요일: "목",
      사유: "운영반영",
    });
    expect(notes[2]).toBe("스탬프(휴가 아님)");
    expect(notes[4]).toBe("https://www.gbitportal.co.kr/stamp/approve");
    expect(notes[4]).not.toContain("/leave/approve");
  });

  it("STAMP_REQUEST 번호 없으면 LEAVE_REQUEST 번호로 fallback", () => {
    expect(
      resolveDirectsendUserTemplateNo("STAMP_REQUEST", { LEAVE_REQUEST: "3" }),
    ).toEqual({ userTemplateNo: "3", fallbackFrom: "LEAVE_REQUEST" });
    expect(
      resolveDirectsendUserTemplateNo("STAMP_REQUEST", { STAMP_REQUEST: "99", LEAVE_REQUEST: "3" }),
    ).toEqual({ userTemplateNo: "99", fallbackFrom: null });
    expect(resolveDirectsendUserTemplateNo("STAMP_REQUEST", {})).toEqual({
      userTemplateNo: "",
      fallbackFrom: null,
    });
  });

  it("DirectSend 미설정이면 MOCKED (실제 발송 없음)", async () => {
    delete process.env.DIRECTSEND_USERNAME;
    delete process.env.DIRECTSEND_API_KEY;
    delete process.env.DIRECTSEND_KAKAO_PLUS_ID;
    delete process.env.DIRECTSEND_ALIMTALK_TEMPLATE_NOS;
    const prisma = mockPrisma();
    await sendStampRequestAlimtalk(
      prisma as never,
      "approver-1",
      "01012345678",
      "김팀장",
      "이직원",
      "2026-09-03",
      "운영반영일 참석",
    );
    expect(prisma.notificationLog.create).toHaveBeenCalledTimes(1);
    const arg = prisma.notificationLog.create.mock.calls[0][0];
    expect(arg.data.templateCode).toBe("STAMP_REQUEST");
    expect(arg.data.status).toBe("MOCKED");
    expect(arg.data.targetId).toBe("approver-1");
    expect(String(arg.data.params)).toContain("스탬프(휴가 아님)");
    expect(directsendKakaoAlimtalk).not.toHaveBeenCalled();
  });

  it("STAMP_REQUEST 번호가 없어도 LEAVE_REQUEST 번호가 있으면 그 번호로 발송(본문은 스탬프)", async () => {
    process.env.DIRECTSEND_USERNAME = "user";
    process.env.DIRECTSEND_API_KEY = "key";
    process.env.DIRECTSEND_KAKAO_PLUS_ID = "@gbit";
    process.env.DIRECTSEND_ALIMTALK_TEMPLATE_NOS = '{"LEAVE_REQUEST":"3"}';
    process.env.ALIMTALK_NOTE_LAYOUT = "v1";
    delete process.env.ALIMTALK_ALLOWED_RECEIVER;
    directsendKakaoAlimtalk.mockResolvedValue({ ok: true, status: 200, raw: "{}", json: {} });
    const prisma = mockPrisma();
    await sendStampRequestAlimtalk(
      prisma as never,
      "approver-1",
      "01012345678",
      "김팀장",
      "이직원",
      "2026-09-03",
      "운영반영",
    );
    expect(directsendKakaoAlimtalk).toHaveBeenCalledTimes(1);
    const sent = directsendKakaoAlimtalk.mock.calls[0][0];
    expect(sent.userTemplateNo).toBe("3");
    expect(sent.receiver[0].note3).toBe("스탬프(휴가 아님)");
    expect(sent.receiver[0].note4).toContain("[스탬프]");
    expect(sent.receiver[0].note3).not.toMatch(/연차|반차/);
    const arg = prisma.notificationLog.create.mock.calls[0][0];
    expect(arg.data.status).toBe("SENT");
    expect(arg.data.templateCode).toBe("STAMP_REQUEST");
    expect(String(arg.data.errorMsg)).toContain("LEAVE_REQUEST");
  });

  it("ALIMTALK_ALLOWED_RECEIVER 밖 번호는 SKIPPED", async () => {
    process.env.DIRECTSEND_USERNAME = "user";
    process.env.DIRECTSEND_API_KEY = "key";
    process.env.DIRECTSEND_KAKAO_PLUS_ID = "@gbit";
    process.env.DIRECTSEND_ALIMTALK_TEMPLATE_NOS = '{"STAMP_REQUEST":"99"}';
    process.env.ALIMTALK_ALLOWED_RECEIVER = "01099999999";
    const prisma = mockPrisma();
    await sendStampRequestAlimtalk(
      prisma as never,
      "approver-1",
      "01012345678",
      "김팀장",
      "이직원",
      "2026-09-03",
      "운영반영",
    );
    const arg = prisma.notificationLog.create.mock.calls[0][0];
    expect(arg.data.status).toBe("SKIPPED");
    expect(directsendKakaoAlimtalk).not.toHaveBeenCalled();
  });
});

describe("STAMP_RESULT alimtalk", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    restoreEnv(envBackup);
    directsendKakaoAlimtalk.mockReset();
  });

  it("note 매핑(v1): 처리결과는 스탬프 승인, 비고는 [스탬프] 날짜·사유", () => {
    process.env.ALIMTALK_NOTE_LAYOUT = "v1";
    const notes = directsendNotesForPortalTemplate("STAMP_RESULT", {
      신청자명: "이직원",
      처리결과: "스탬프 승인",
      처리코멘트: "[스탬프] 2026-09-03(목) · 운영반영일 참석",
    });
    expect(notes[0]).toBe("이직원");
    expect(notes[1]).toBe("스탬프 승인");
    expect(notes[2]).toBe("[스탬프] 2026-09-03(목) · 운영반영일 참석");
    expect(notes[4]).toBe("");
    const leave = directsendNotesForPortalTemplate("LEAVE_RESULT", {
      신청자명: "이직원",
      처리결과: "승인",
      처리코멘트: "-",
    });
    expect(notes[1]).not.toBe(leave[1]);
    expect(notes[2]).not.toBe(leave[2]);
  });

  it("note 매핑(v2): 비고5에 /stamp (휴가 내역 아님)", () => {
    process.env.ALIMTALK_NOTE_LAYOUT = "v2";
    process.env.NEXTAUTH_URL = "https://www.gbitportal.co.kr";
    const notes = directsendNotesForPortalTemplate("STAMP_RESULT", {
      신청자명: "이직원",
      처리결과: "스탬프 반려",
      처리코멘트: "[스탬프] 2026-09-03(목) · 운영반영 · 사유 부족",
    });
    expect(notes[1]).toBe("스탬프 반려");
    expect(notes[4]).toBe("https://www.gbitportal.co.kr/stamp");
    expect(notes[4]).not.toContain("/leave/my");
  });

  it("STAMP_RESULT 번호 없으면 LEAVE_RESULT 번호로 fallback", () => {
    expect(
      resolveDirectsendUserTemplateNo("STAMP_RESULT", { LEAVE_RESULT: "9" }),
    ).toEqual({ userTemplateNo: "9", fallbackFrom: "LEAVE_RESULT" });
    expect(
      resolveDirectsendUserTemplateNo("STAMP_RESULT", { STAMP_RESULT: "88", LEAVE_RESULT: "9" }),
    ).toEqual({ userTemplateNo: "88", fallbackFrom: null });
    expect(resolveDirectsendUserTemplateNo("STAMP_RESULT", {})).toEqual({
      userTemplateNo: "",
      fallbackFrom: null,
    });
  });

  it("STAMP_RESULT 번호가 없어도 LEAVE_RESULT 번호가 있으면 그 번호로 발송(본문은 스탬프)", async () => {
    process.env.DIRECTSEND_USERNAME = "user";
    process.env.DIRECTSEND_API_KEY = "key";
    process.env.DIRECTSEND_KAKAO_PLUS_ID = "@gbit";
    process.env.DIRECTSEND_ALIMTALK_TEMPLATE_NOS = '{"LEAVE_RESULT":"9"}';
    process.env.ALIMTALK_NOTE_LAYOUT = "v1";
    delete process.env.ALIMTALK_ALLOWED_RECEIVER;
    directsendKakaoAlimtalk.mockResolvedValue({ ok: true, status: 200, raw: "{}", json: {} });
    const prisma = mockPrisma();
    await sendStampResultAlimtalk(
      prisma as never,
      "emp-1",
      "01012345678",
      "이직원",
      "스탬프 승인",
      "2026-09-03",
      "운영반영",
      "",
    );
    expect(directsendKakaoAlimtalk).toHaveBeenCalledTimes(1);
    const sent = directsendKakaoAlimtalk.mock.calls[0][0];
    expect(sent.userTemplateNo).toBe("9");
    expect(sent.receiver[0].note2).toBe("스탬프 승인");
    expect(sent.receiver[0].note3).toContain("[스탬프]");
    expect(sent.receiver[0].note3).toContain("운영반영");
    const arg = prisma.notificationLog.create.mock.calls[0][0];
    expect(arg.data.status).toBe("SENT");
    expect(arg.data.templateCode).toBe("STAMP_RESULT");
    expect(arg.data.targetId).toBe("emp-1");
    expect(String(arg.data.errorMsg)).toContain("LEAVE_RESULT");
  });
});
