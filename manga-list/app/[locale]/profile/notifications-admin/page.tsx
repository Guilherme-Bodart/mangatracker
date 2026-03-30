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
  updateAdminNotification,
  type AdminAnnouncement,
} from "@/lib/notifications-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type AnnouncementFormState = {
  titlePt: string;
  titleEn: string;
  messagePt: string;
  messageEn: string;
};

const EMPTY_FORM: AnnouncementFormState = {
  titlePt: "",
  titleEn: "",
  messagePt: "",
  messageEn: "",
};

function toFormState(announcement: AdminAnnouncement): AnnouncementFormState {
  return {
    titlePt: announcement.titlePt ?? "",
    titleEn: announcement.titleEn ?? "",
    messagePt: announcement.messagePt ?? "",
    messageEn: announcement.messageEn ?? "",
  };
}

export default function NotificationsAdminPage() {
  const t = useTranslations("NotificationsAdmin");
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [form, setForm] = useState<AnnouncementFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!form.messagePt.trim() && !form.messageEn.trim()) {
      toast.error(t("messages.messageLocaleRequired"));
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        titlePt: form.titlePt.trim() || undefined,
        titleEn: form.titleEn.trim() || undefined,
        messagePt: form.messagePt.trim() || undefined,
        messageEn: form.messageEn.trim() || undefined,
      };

      if (editingId) {
        await updateAdminNotification(editingId, payload);
        toast.success(t("messages.updateSuccess"));
      } else {
        await createAdminNotification(payload);
        toast.success(t("messages.createSuccess"));
      }

      resetForm();
      await loadAnnouncements();
      window.dispatchEvent(new Event("notifications:updated"));
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 403) {
        handleForbidden();
        return;
      }

      toast.error(
        getApiErrorMessage(
          error,
          editingId ? t("messages.updateError") : t("messages.createError"),
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (announcement: AdminAnnouncement) => {
    setEditingId(announcement.id);
    setForm(toFormState(announcement));
  };

  const handleRemove = async (id: string) => {
    try {
      await deleteAdminNotification(id);
      toast.success(t("messages.removeSuccess"));
      await loadAnnouncements();
      window.dispatchEvent(new Event("notifications:updated"));
      if (editingId === id) {
        resetForm();
      }
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
          <CardTitle>
            {editingId ? t("form.editTitle") : t("form.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="announcement-title-pt">{t("form.titlePtLabel")}</Label>
                <Input
                  id="announcement-title-pt"
                  value={form.titlePt}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, titlePt: event.target.value }))
                  }
                  placeholder={t("form.titlePtPlaceholder")}
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="announcement-title-en">{t("form.titleEnLabel")}</Label>
                <Input
                  id="announcement-title-en"
                  value={form.titleEn}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, titleEn: event.target.value }))
                  }
                  placeholder={t("form.titleEnPlaceholder")}
                  maxLength={120}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="announcement-message-pt">{t("form.messagePtLabel")}</Label>
                <Textarea
                  id="announcement-message-pt"
                  value={form.messagePt}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, messagePt: event.target.value }))
                  }
                  placeholder={t("form.messagePtPlaceholder")}
                  rows={5}
                  maxLength={2000}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="announcement-message-en">{t("form.messageEnLabel")}</Label>
                <Textarea
                  id="announcement-message-en"
                  value={form.messageEn}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, messageEn: event.target.value }))
                  }
                  placeholder={t("form.messageEnPlaceholder")}
                  rows={5}
                  maxLength={2000}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? editingId
                    ? t("form.updating")
                    : t("form.submitting")
                  : editingId
                    ? t("form.update")
                    : t("form.submit")}
              </Button>
              {editingId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  disabled={isSubmitting}
                >
                  {t("form.cancelEdit")}
                </Button>
              ) : null}
            </div>
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
              <div key={announcement.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">
                      {announcement.title || t("list.defaultTitle")}
                    </p>
                    <Badge variant={announcement.isActive ? "default" : "secondary"}>
                      {announcement.isActive ? t("list.active") : t("list.removed")}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(announcement)}
                    >
                      {t("list.edit")}
                    </Button>
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
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{t("list.ptSection")}</p>
                    <p className="text-sm font-semibold">
                      {announcement.titlePt || t("list.defaultTitle")}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">
                      {announcement.messagePt || t("list.localeEmpty")}
                    </p>
                  </div>
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{t("list.enSection")}</p>
                    <p className="text-sm font-semibold">
                      {announcement.titleEn || t("list.defaultTitle")}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">
                      {announcement.messageEn || t("list.localeEmpty")}
                    </p>
                  </div>
                </div>

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
