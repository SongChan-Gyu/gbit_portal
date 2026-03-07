import prisma from "@/lib/db";

export type NotificationType =
  | "LEAVE_REQUEST"
  | "LEAVE_APPROVED"
  | "LEAVE_REJECTED"
  | "LEAVE_CANCEL_REQUEST"
  | "LEAVE_CANCELED"
  | "STAMP_REQUEST"
  | "STAMP_APPROVED"
  | "STAMP_REJECTED"
  | "SYSTEM";

const TYPE_LABELS: Record<NotificationType, string> = {
  LEAVE_REQUEST:        "휴가 결재 요청",
  LEAVE_APPROVED:       "휴가 승인",
  LEAVE_REJECTED:       "휴가 반려",
  LEAVE_CANCEL_REQUEST: "휴가 취소 요청",
  LEAVE_CANCELED:       "휴가 취소 완료",
  STAMP_REQUEST:        "스탬프 승인 요청",
  STAMP_APPROVED:       "스탬프 승인",
  STAMP_REJECTED:       "스탬프 반려",
  SYSTEM:               "시스템 알림",
};

export async function createNotification({
  employeeId,
  type,
  title,
  body,
  link,
}: {
  employeeId: string;
  type: NotificationType;
  title?: string;
  body: string;
  link?: string;
}) {
  return prisma.notification.create({
    data: {
      employeeId,
      type,
      title: title ?? TYPE_LABELS[type],
      body,
      link: link ?? null,
    },
  });
}

export async function createNotifications(
  notifications: {
    employeeId: string;
    type: NotificationType;
    title?: string;
    body: string;
    link?: string;
  }[]
) {
  if (notifications.length === 0) return;
  return prisma.notification.createMany({
    data: notifications.map((n) => ({
      employeeId: n.employeeId,
      type: n.type,
      title: n.title ?? TYPE_LABELS[n.type],
      body: n.body,
      link: n.link ?? null,
    })),
  });
}
