"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
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

const UNREAD_CACHE_KEY = "mt:notifications:unread-count:v1";
const UNREAD_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type UnreadCountCache = {
  count: number;
  fetchedAt: number;
};

function readUnreadCountCache(): UnreadCountCache | null {
  try {
    const raw = window.localStorage.getItem(UNREAD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UnreadCountCache>;
    if (
      typeof parsed.count !== "number" ||
      !Number.isFinite(parsed.count) ||
      typeof parsed.fetchedAt !== "number" ||
      !Number.isFinite(parsed.fetchedAt)
    ) {
      return null;
    }
    return {
      count: Math.max(0, Math.floor(parsed.count)),
      fetchedAt: parsed.fetchedAt,
    };
  } catch {
    return null;
  }
}

function writeUnreadCountCache(count: number): void {
  const safeCount = Math.max(0, Math.floor(count));
  const payload: UnreadCountCache = {
    count: safeCount,
    fetchedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(UNREAD_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota/private mode failures.
  }
}

export function NotificationBell() {
  const tHeader = useTranslations("Header");
  const tNotifications = useTranslations("Notifications");
  const locale = useLocale();
  const [count, setCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<UserAnnouncement[]>([]);
  const [previewError, setPreviewError] = useState(false);

  const refreshCount = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (!force) {
      const cached = readUnreadCountCache();
      if (cached && Date.now() - cached.fetchedAt < UNREAD_CACHE_TTL_MS) {
        setCount(cached.count);
        return;
      }
    }

    try {
      const result = await getNotificationUnreadCount();
      setCount(result.count);
      writeUnreadCountCache(result.count);
    } catch {
      // Silent fail to keep header responsive.
      const cached = readUnreadCountCache();
      if (cached) {
        setCount(cached.count);
      }
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
  }, [refreshCount]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      void refreshCount({ force: true });
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
