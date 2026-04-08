"use client";

import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Menu, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notifications/notification-bell";

export function Header() {
  const t = useTranslations("Header");
  const { user, logout, isLoading } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
          <span className="md:hidden">
            <img
              src="/logos/logo-icon-light.svg"
              alt="Manga Tracker"
              className="size-9 rounded-md dark:hidden"
            />
            <img
              src="/logos/logo-icon-dark.svg"
              alt="Manga Tracker"
              className="hidden size-9 rounded-md dark:block"
            />
          </span>
          <span className="hidden md:block">
            <img
              src="/logos/logo-full-light.svg"
              alt="Manga Tracker"
              className="h-10 w-auto dark:hidden"
            />
            <img
              src="/logos/logo-full-dark.svg"
              alt="Manga Tracker"
              className="hidden h-10 w-auto dark:block"
            />
          </span>
        </Link>

        <nav className="hidden items-center gap-4 md:flex">
          <Button variant="ghost" asChild>
            <Link href="/manga" prefetch={false}>
              {t("explore")}
            </Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/ranking" prefetch={false}>
              {t("ranking")}
            </Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/my-track" prefetch={false}>
              {t("myTrack")}
            </Link>
          </Button>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {isLoading ? (
              <div className="size-10 animate-pulse rounded-full border-2 border-primary/20" />
            ) : user ? (
              <>
                <NotificationBell />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={t("profileMenu")}
                    >
                      <Avatar className="size-10 cursor-pointer border-2 border-primary/20 transition-colors hover:border-primary">
                        <AvatarImage
                          src={user.avatarUrl || undefined}
                          alt={user.username}
                        />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          <User className="size-5" />
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{user.username}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/profile" prefetch={false}>
                        {t("profile")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/profile/notifications" prefetch={false}>
                        {t("notifications")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/user/${user.username}`} prefetch={false}>
                        {t("publicProfile")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={(event) => {
                        event.preventDefault();
                        void logout();
                      }}
                    >
                      <LogOut className="size-4" />
                      {t("logout")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Button asChild>
                <Link
                  href="/auth/login"
                  className="flex items-center gap-2"
                  prefetch={false}
                >
                  <User className="size-4" />
                  {t("login")}
                </Link>
              </Button>
            )}
          </div>
        </nav>

        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          {isLoading ? (
            <div className="size-10 animate-pulse rounded-full border-2 border-primary/20" />
          ) : (
            <>
              {user ? <NotificationBell /> : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("menu")}
                    className="size-9"
                  >
                    <Menu className="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="w-64 max-w-[calc(100vw-1rem)]"
                >
                  <DropdownMenuLabel>{t("menu")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/manga" prefetch={false}>
                      {t("explore")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/ranking" prefetch={false}>
                      {t("ranking")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/my-track" prefetch={false}>
                      {t("myTrack")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {user ? (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href="/profile" prefetch={false}>
                          {t("profile")}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/profile/notifications" prefetch={false}>
                          {t("notifications")}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/user/${user.username}`} prefetch={false}>
                          {t("publicProfile")}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={(event) => {
                          event.preventDefault();
                          void logout();
                        }}
                      >
                        <LogOut className="size-4" />
                        {t("logout")}
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuItem asChild>
                      <Link href="/auth/login" prefetch={false}>
                        {t("login")}
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
