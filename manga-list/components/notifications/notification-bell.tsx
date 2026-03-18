"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getNotificationUnreadCount,
  listNotifications,
  type UserAnnouncement,
} from "@/lib/notifications-api";

const REFRESH_INTERVAL_MS = 60_000;

export function NotificationBell() {
  const tHeader = useTranslations("Header");
  const tNotifications = useTranslations("Notifications");
  const locale = useLocale();
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<UserAnnouncement[]>([]);
  const [previewError, setPreviewError] = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      const result = await getNotificationUnreadCount();
      setCount(result.count);
    } catch {
      // Silent fail to keep header responsive.
    }
  }, []);

  const loadPreview = useCallback(async () => {
    setIsLoadingPreview(true);
    setPreviewError(false);
    try {
      const result = await listNotifications();
      setPreview(result.slice(0, 5));
    } catch {
      setPreview([]);
      setPreviewError(true);
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    void refreshCount();
  }, [pathname, refreshCount]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshCount();
    }, REFRESH_INTERVAL_MS);

    const handleFocus = () => {
      void refreshCount();
    };

    const handleNotificationsUpdated = () => {
      void refreshCount();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("notifications:updated", handleNotificationsUpdated);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("notifications:updated", handleNotificationsUpdated);
    };
  }, [refreshCount]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      void refreshCount();
      void loadPreview();
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <div className="relative">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={tHeader("notificationsAria")}>
            <Bell className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        {count > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center leading-none">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </div>

      <DropdownMenuContent align="end" sideOffset={8} className="w-[380px] p-0">
        <div className="border-b p-4">
          <p className="text-lg font-semibold">{tHeader("notifications")}</p>
          <p className="text-sm text-muted-foreground">{tNotifications("subtitle")}</p>
        </div>

        {isLoadingPreview ? (
          <div className="p-4 text-sm text-muted-foreground">{tNotifications("loading")}</div>
        ) : previewError ? (
          <p className="p-4 text-sm text-destructive">
            {tNotifications("messages.loadError")}
          </p>
        ) : preview.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{tNotifications("empty")}</p>
        ) : (
          <div className="max-h-[50vh] space-y-3 overflow-y-auto p-4">
            {preview.map((item) => (
              <div key={item.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">
                    {item.title || tNotifications("defaultTitle")}
                  </p>
                  {!item.isRead ? (
                    <Badge variant="secondary">{tNotifications("unread")}</Badge>
                  ) : null}
                </div>
                <p className="text-sm whitespace-pre-wrap">{item.message}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString(
                    locale === "pt" ? "pt-BR" : "en-US",
                  )}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="border-t p-3 flex justify-end">
          <Button variant="outline" asChild>
            <Link
              href="/profile/notifications"
              onClick={() => {
                setIsOpen(false);
              }}
            >
              {tHeader("notifications")}
            </Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
