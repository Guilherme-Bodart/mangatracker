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
import { LogOut, User } from "lucide-react";
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
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
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
        </Link>

        {/* Navegação */}
        <nav className="flex items-center gap-4">
          <Button variant="ghost" asChild>
            <Link href="/manga">{t("explore")}</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/ranking">{t("ranking")}</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/my-track">{t("myTrack")}</Link>
          </Button>

          {/* Theme Toggle + Auth */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {isLoading ? (
              <div className="size-10 rounded-full border-2 border-primary/20 animate-pulse" />
            ) : user ? (
              <>
                <NotificationBell />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={t("profileMenu")}
                    >
                      <Avatar className="size-10 cursor-pointer border-2 border-primary/20 hover:border-primary transition-colors">
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
                      <Link href="/profile">{t("profile")}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/profile/notifications">{t("notifications")}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/user/${user.username}`}>{t("publicProfile")}</Link>
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
                <Link href="/auth/login" className="flex items-center gap-2">
                  <User className="size-4" />
                  {t("login")}
                </Link>
              </Button>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
