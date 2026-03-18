import { apiRequest } from "@/lib/api-client";

export type UserAnnouncement = {
  id: string;
  title: string | null;
  message: string;
  createdAt: string;
  isRead: boolean;
  readAt: string | null;
};

export type AdminAnnouncement = {
  id: string;
  title: string | null;
  message: string;
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
  message: string;
}) {
  return apiRequest<{
    id: string;
    title: string | null;
    message: string;
    isActive: boolean;
    createdAt: string;
  }>("/notifications/admin", {
    method: "POST",
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

