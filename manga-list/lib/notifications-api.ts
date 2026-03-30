import { apiRequest } from "@/lib/api-client";

export type UserAnnouncement = {
  id: string;
  title: string | null;
  titlePt: string | null;
  titleEn: string | null;
  message: string;
  messagePt: string | null;
  messageEn: string | null;
  createdAt: string;
  isRead: boolean;
  readAt: string | null;
};

export type AdminAnnouncement = {
  id: string;
  title: string | null;
  titlePt: string | null;
  titleEn: string | null;
  message: string;
  messagePt: string | null;
  messageEn: string | null;
  isActive: boolean;
  createdAt: string;
  removedAt: string | null;
  readCount: number;
  createdBy: {
    id: string;
    username: string;
    email: string;
  } | null;
};

export async function listNotifications() {
  return apiRequest<UserAnnouncement[]>("/notifications");
}

export async function getNotificationUnreadCount() {
  return apiRequest<{ count: number }>("/notifications/unread-count");
}

export async function markAllNotificationsRead() {
  return apiRequest<{ markedCount: number; unreadCount: number }>(
    "/notifications/mark-all-read",
    {
      method: "POST",
      csrf: "authenticated-required",
    },
  );
}

export async function listAdminNotifications(includeInactive = true) {
  const suffix = `?includeInactive=${includeInactive ? "true" : "false"}`;
  return apiRequest<AdminAnnouncement[]>(`/notifications/admin${suffix}`);
}

export async function createAdminNotification(input: {
  title?: string;
  titlePt?: string;
  titleEn?: string;
  message?: string;
  messagePt?: string;
  messageEn?: string;
}) {
  return apiRequest<{
    id: string;
    title: string | null;
    titlePt: string | null;
    titleEn: string | null;
    message: string;
    messagePt: string | null;
    messageEn: string | null;
    isActive: boolean;
    createdAt: string;
  }>("/notifications/admin", {
    method: "POST",
    csrf: "authenticated-required",
    body: input,
  });
}

export async function updateAdminNotification(
  id: string,
  input: {
    title?: string;
    titlePt?: string;
    titleEn?: string;
    message?: string;
    messagePt?: string;
    messageEn?: string;
  },
) {
  return apiRequest<{
    id: string;
    title: string | null;
    titlePt: string | null;
    titleEn: string | null;
    message: string;
    messagePt: string | null;
    messageEn: string | null;
    isActive: boolean;
    createdAt: string;
    removedAt: string | null;
  }>(`/notifications/admin/${encodeURIComponent(id)}`, {
    method: "PATCH",
    csrf: "authenticated-required",
    body: input,
  });
}

export async function deleteAdminNotification(id: string) {
  return apiRequest<{ success: true; alreadyRemoved: boolean }>(
    `/notifications/admin/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      csrf: "authenticated-required",
    },
  );
}
