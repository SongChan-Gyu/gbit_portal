import { describe, expect, it } from "vitest";
import {
  phoneLooksSendable,
  roleAfterBecomingLeader,
  roleAfterLeavingLeader,
  shouldReassignMemberApproval,
} from "./teamLeader";

describe("phoneLooksSendable", () => {
  it("숫자 10자리 이상이면 발송 가능으로 본다", () => {
    expect(phoneLooksSendable("010-1234-5678")).toBe(true);
    expect(phoneLooksSendable("01012345678")).toBe(true);
  });

  it("번호가 짧거나 없으면 발송 불가다", () => {
    expect(phoneLooksSendable("")).toBe(false);
    expect(phoneLooksSendable(null)).toBe(false);
    expect(phoneLooksSendable("123")).toBe(false);
  });
});

describe("roleAfterBecomingLeader", () => {
  it("팀원은 팀장 역할로 올린다", () => {
    expect(roleAfterBecomingLeader("STAFF")).toBe("TEAM_LEAD");
  });

  it("PM·관리자·이미 팀장은 그대로 둔다", () => {
    expect(roleAfterBecomingLeader("PM")).toBe("PM");
    expect(roleAfterBecomingLeader("ADMIN")).toBe("ADMIN");
    expect(roleAfterBecomingLeader("TEAM_LEAD")).toBe("TEAM_LEAD");
  });
});

describe("roleAfterLeavingLeader", () => {
  it("다른 팀 팀장이 아니면 팀장 역할을 팀원으로 내린다", () => {
    expect(roleAfterLeavingLeader("TEAM_LEAD", false)).toBe("STAFF");
  });

  it("PM·관리자는 내리지 않는다", () => {
    expect(roleAfterLeavingLeader("PM", false)).toBe("PM");
    expect(roleAfterLeavingLeader("ADMIN", false)).toBe("ADMIN");
  });
});

describe("shouldReassignMemberApproval", () => {
  it("팀원 신청이 이전 팀장에게 있으면 새 팀장에게 넘긴다", () => {
    expect(
      shouldReassignMemberApproval({
        applicantId: "staff",
        applicantRole: "STAFF",
        approverId: "old-leader",
        newLeaderId: "new-leader",
      }),
    ).toBe(true);
  });

  it("이미 새 팀장 결재면 건너뛴다", () => {
    expect(
      shouldReassignMemberApproval({
        applicantId: "staff",
        applicantRole: "STAFF",
        approverId: "new-leader",
        newLeaderId: "new-leader",
      }),
    ).toBe(false);
  });

  it("새 팀장 본인 신청은 자기 결재로 넘기지 않는다", () => {
    expect(
      shouldReassignMemberApproval({
        applicantId: "new-leader",
        applicantRole: "STAFF",
        approverId: "old-leader",
        newLeaderId: "new-leader",
      }),
    ).toBe(false);
  });

  it("팀장·PM 본인 신청은 그대로 둔다", () => {
    expect(
      shouldReassignMemberApproval({
        applicantId: "old-leader",
        applicantRole: "TEAM_LEAD",
        approverId: "pm",
        newLeaderId: "new-leader",
      }),
    ).toBe(false);
  });
});
