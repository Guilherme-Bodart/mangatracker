"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  listNotifications,
  markAllNotificationsRead,
  type UserAnnouncement,
} from "@/lib/notifications-api";

function getLocalizedAnnouncementContent(item: UserAnnouncement, locale: string) {
  const usePt = locale === "pt";
  const title = usePt
    ? item.titlePt || item.titleEn || item.title
    : item.titleEn || item.titlePt || item.title;
  const message = usePt
    ? item.messagePt || item.messageEn || item.message
    : item.messageEn || item.messagePt || item.message;
  return { title, message };
}

export default function NotificationsPage() {
  const t = useTranslations("Notifications");
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState<UserAnnouncement[]>([]);

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      await markAllNotificationsRead();
      const data = await listNotifications();
      setNotifications(data);
      window.dispatchEvent(new Event("notifications:updated"));
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t("messages.loadError")));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/auth/login");
    }
  }, [isAuthLoading, router, user]);

  useEffect(() => {
    if (!user) return;
    void loadNotifications();
  }, [loadNotifications, user]);

  if (isAuthLoading || !user) {
    return null;
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground mt-2">{t("subtitle")}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => void loadNotifications()}
          className="w-full sm:w-auto"
        >
          {t("refresh")}
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t("loading")}
          </CardContent>
        </Card>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t("empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {notifications.map((item) => {
            const localized = getLocalizedAnnouncementContent(item, locale);
            return (
              <Card key={item.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">
                    {localized.title || t("defaultTitle")}
                  </CardTitle>
                  {!item.isRead ? (
                    <Badge variant="secondary">{t("unread")}</Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {localized.message}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString(
                    locale === "pt" ? "pt-BR" : "en-US",
                  )}
                </p>
              </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
