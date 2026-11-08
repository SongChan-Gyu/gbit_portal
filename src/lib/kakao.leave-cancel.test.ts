import { afterEach, describe, expect, it, vi } from "vitest";
import {
  alimtalkNoteLayoutVersion,
  directsendNotesForPortalTemplate,
  resolveDirectsendUserTemplateNo,
  sendLeaveCancelRequestAlimtalk,
  trySendLeaveCancelRequestAlimtalk,
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

describe("LEAVE_CANCEL_REQUEST alimtalk", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    restoreEnv(envBackup);
    directsendKakaoAlimtalk.mockReset();
  });

  it("note 매핑(v1): 휴가유형 칸에 취소신청, 기간은 휴가와 동일 형식", () => {
    process.env.ALIMTALK_NOTE_LAYOUT = "v1";
    expect(alimtalkNoteLayoutVersion()).toBe("v1");
    const notes = directsendNotesForPortalTemplate("LEAVE_CANCEL_REQUEST", {
      결재자명: "김팀장",
      신청자명: "이직원",
      휴가유형: "취소신청 · 연차",
      시작일: "2026-09-03",
      시작요일: "목",
      종료일: "2026-09-04",
      종료요일: "금",
    });
    expect(notes[0]).toBe("김팀장");
    expect(notes[1]).toBe("이직원");
    expect(notes[2]).toBe("취소신청 · 연차");
    expect(notes[3]).toBe("2026-09-03(목) ~ 2026-09-04(금)");
    expect(notes[4]).toBe("");
  });

  it("note 매핑(v2): 비고5에 /leave/approve", () => {
    process.env.ALIMTALK_NOTE_LAYOUT = "v2";
    process.env.NEXTAUTH_URL = "https://www.gbitportal.co.kr";
    const notes = directsendNotesForPortalTemplate("LEAVE_CANCEL_REQUEST", {
      결재자명: "김팀장",
      신청자명: "이직원",
      휴가유형: "취소신청 · 연차",
      시작일: "2026-09-03",
      시작요일: "목",
      종료일: "2026-09-04",
      종료요일: "금",
    });
    expect(notes[2]).toBe("취소신청 · 연차");
    expect(notes[4]).toBe("https://www.gbitportal.co.kr/leave/approve");
  });

  it("LEAVE_CANCEL_REQUEST 번호 없으면 LEAVE_REQUEST 번호로 fallback", () => {
    expect(
      resolveDirectsendUserTemplateNo("LEAVE_CANCEL_REQUEST", { LEAVE_REQUEST: "3" }),
    ).toEqual({ userTemplateNo: "3", fallbackFrom: "LEAVE_REQUEST" });
    expect(
      resolveDirectsendUserTemplateNo("LEAVE_CANCEL_REQUEST", {
        LEAVE_CANCEL_REQUEST: "77",
        LEAVE_REQUEST: "3",
      }),
    ).toEqual({ userTemplateNo: "77", fallbackFrom: null });
    expect(resolveDirectsendUserTemplateNo("LEAVE_CANCEL_REQUEST", {})).toEqual({
      userTemplateNo: "",
      fallbackFrom: null,
    });
  });

  it("전용 번호가 없어도 LEAVE_REQUEST 번호가 있으면 그 번호로 발송(본문은 취소신청)", async () => {
    process.env.DIRECTSEND_USERNAME = "user";
    process.env.DIRECTSEND_API_KEY = "key";
    process.env.DIRECTSEND_KAKAO_PLUS_ID = "@gbit";
    process.env.DIRECTSEND_ALIMTALK_TEMPLATE_NOS = '{"LEAVE_REQUEST":"3"}';
    process.env.ALIMTALK_NOTE_LAYOUT = "v1";
    delete process.env.ALIMTALK_ALLOWED_RECEIVER;
    directsendKakaoAlimtalk.mockResolvedValue({ ok: true, status: 200, raw: "{}", json: {} });
    const prisma = mockPrisma();
    await sendLeaveCancelRequestAlimtalk(
      prisma as never,
      "approver-1",
      "01012345678",
      "김팀장",
      "이직원",
      "연차",
      "2026-09-03",
      "2026-09-04",
    );
    expect(directsendKakaoAlimtalk).toHaveBeenCalledTimes(1);
    const sent = directsendKakaoAlimtalk.mock.calls[0][0];
    expect(sent.userTemplateNo).toBe("3");
    expect(sent.receiver[0].note3).toBe("취소신청 · 연차");
    expect(sent.receiver[0].note4).toContain("2026-09-03");
    const arg = prisma.notificationLog.create.mock.calls[0][0];
    expect(arg.data.status).toBe("SENT");
    expect(arg.data.templateCode).toBe("LEAVE_CANCEL_REQUEST");
    expect(arg.data.targetId).toBe("approver-1");
    expect(String(arg.data.errorMsg)).toContain("LEAVE_REQUEST");
  });

  it("연락처 없거나 알림톡 미사용이면 발송하지 않음", async () => {
    const prisma = mockPrisma();
    const items = [
      {
        leaveType: { name: "연차" },
        startDate: new Date("2026-09-03T00:00:00+09:00"),
        endDate: new Date("2026-09-03T00:00:00+09:00"),
      },
    ];
    await trySendLeaveCancelRequestAlimtalk(
      prisma as never,
      "test",
      { id: "a1", name: "김팀장", phone: "", alimtalkEnabled: true },
      "이직원",
      items,
    );
    await trySendLeaveCancelRequestAlimtalk(
      prisma as never,
      "test",
      { id: "a1", name: "김팀장", phone: "01012345678", alimtalkEnabled: false },
      "이직원",
      items,
    );
    expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    expect(directsendKakaoAlimtalk).not.toHaveBeenCalled();
  });
});
