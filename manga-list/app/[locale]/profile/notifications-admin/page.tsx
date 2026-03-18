"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useAuth } from "@/contexts/auth-context";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ApiClientError, getApiErrorMessage } from "@/lib/api-client";
import {
  createAdminNotification,
  deleteAdminNotification,
  listAdminNotifications,
  type AdminAnnouncement,
} from "@/lib/notifications-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export default function NotificationsAdminPage() {
  const t = useTranslations("NotificationsAdmin");
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleForbidden = useCallback(() => {
    toast.error(t("messages.forbidden"));
    router.replace("/profile");
  }, [router, t]);

  const loadAnnouncements = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listAdminNotifications(true);
      setAnnouncements(data);
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 403) {
        handleForbidden();
        return;
      }
      toast.error(getApiErrorMessage(error, t("messages.loadError")));
    } finally {
      setIsLoading(false);
    }
  }, [handleForbidden, t]);

  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/auth/login");
    }
  }, [isAuthLoading, router, user]);

  useEffect(() => {
    if (!user) return;
    void loadAnnouncements();
  }, [loadAnnouncements, user]);

  if (isAuthLoading || !user) {
    return null;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim()) {
      toast.error(t("messages.messageRequired"));
      return;
    }

    setIsSubmitting(true);
    try {
      await createAdminNotification({
        title: title.trim() || undefined,
        message: message.trim(),
      });
      setTitle("");
      setMessage("");
      toast.success(t("messages.createSuccess"));
      await loadAnnouncements();
      window.dispatchEvent(new Event("notifications:updated"));
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 403) {
        handleForbidden();
        return;
      }
      toast.error(getApiErrorMessage(error, t("messages.createError")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await deleteAdminNotification(id);
      toast.success(t("messages.removeSuccess"));
      await loadAnnouncements();
      window.dispatchEvent(new Event("notifications:updated"));
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 403) {
        handleForbidden();
        return;
      }
      toast.error(getApiErrorMessage(error, t("messages.removeError")));
    }
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("form.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="announcement-title">{t("form.titleLabel")}</Label>
              <Input
                id="announcement-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("form.titlePlaceholder")}
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement-message">{t("form.messageLabel")}</Label>
              <Textarea
                id="announcement-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t("form.messagePlaceholder")}
                rows={5}
                maxLength={2000}
              />
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("form.submitting") : t("form.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("list.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : announcements.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("list.empty")}</p>
          ) : (
            announcements.map((announcement) => (
              <div key={announcement.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">
                      {announcement.title || t("list.defaultTitle")}
                    </p>
                    <Badge variant={announcement.isActive ? "default" : "secondary"}>
                      {announcement.isActive ? t("list.active") : t("list.removed")}
                    </Badge>
                  </div>
                  {announcement.isActive ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void handleRemove(announcement.id)}
                    >
                      {t("list.remove")}
                    </Button>
                  ) : null}
                </div>
                <p className="text-sm whitespace-pre-wrap">{announcement.message}</p>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                  <span>
                    {t("list.createdAt")}:{" "}
                    {new Date(announcement.createdAt).toLocaleString(
                      locale === "pt" ? "pt-BR" : "en-US",
                    )}
                  </span>
                  <span>
                    {t("list.readCount")}: {announcement.readCount}
                  </span>
                  {announcement.createdBy ? (
                    <span>
                      {t("list.createdBy")}: {announcement.createdBy.email}
                    </span>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
