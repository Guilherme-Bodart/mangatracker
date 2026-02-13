"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { User, Camera, Eye } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createCsrfHeaders } from "@/lib/csrf";

export default function ProfilePage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const t = useTranslations("Profile");

  const [formData, setFormData] = useState({
    username: user?.username || "",
    avatarUrl: user?.avatarUrl || "",
    bannerUrl: user?.bannerUrl || "",
    allowNsfw: user?.allowNsfw || false,
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/auth/login");
    }
  }, [isAuthLoading, user, router]);

  useEffect(() => {
    if (!user) return;

    setFormData((prev) => ({
      ...prev,
      username: user.username || "",
      avatarUrl: user.avatarUrl || "",
      bannerUrl: user.bannerUrl || "",
      allowNsfw: user.allowNsfw || false,
    }));
  }, [user]);

  // Redirecting or waiting auth bootstrap
  if (isAuthLoading || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate password match if changing
      if (
        formData.newPassword &&
        formData.newPassword !== formData.confirmPassword
      ) {
        toast.error(t("messages.passwordMismatch"));
        setIsLoading(false);
        return;
      }

      const updateData: Record<string, string | boolean> = {};

      // Only include changed fields
      if (formData.username !== user.username)
        updateData.username = formData.username;
      if (formData.avatarUrl !== user.avatarUrl)
        updateData.avatarUrl = formData.avatarUrl;
      if (formData.bannerUrl !== user.bannerUrl)
        updateData.bannerUrl = formData.bannerUrl;
      if (formData.allowNsfw !== (user.allowNsfw || false))
        updateData.allowNsfw = formData.allowNsfw;
      if (formData.newPassword) {
        updateData.password = formData.newPassword;
        if (formData.currentPassword.trim()) {
          updateData.currentPassword = formData.currentPassword;
        }
      }

      if (Object.keys(updateData).length === 0) {
        toast.info(t("messages.noChanges"));
        setIsLoading(false);
        return;
      }

      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const response = await fetch(`${API_URL}/auth/profile`, {
        method: "PATCH",
        headers: createCsrfHeaders({
          "Content-Type": "application/json",
        }),
        credentials: "include",
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update profile");
      }

      await response.json();
      toast.success(t("messages.success"));

      // Clear password fields
      setFormData((prev) => ({
        ...prev,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));

      // Refresh page to get updated user data
      window.location.reload();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t("messages.error");
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4">
      {/* Header with Public Profile Button */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <Button variant="outline" asChild className="flex items-center gap-2">
          <a
            href={`/user/${user.username}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Eye className="size-4" />
            {t("viewPublic")}
          </a>
        </Button>
      </div>
      <p className="text-muted-foreground">{t("subtitle")}</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Avatar & Banner */}
        <Card>
          <CardHeader>
            <CardTitle>{t("images.title")}</CardTitle>
            <CardDescription>{t("images.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Banner Preview */}
            <div className="space-y-2">
              <Label>{t("images.bannerUrl.label")}</Label>
              <div className="relative h-32 rounded-lg border bg-muted overflow-hidden">
                {formData.bannerUrl ? (
                  <img
                    src={formData.bannerUrl}
                    alt="Banner"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <Camera className="size-8" />
                  </div>
                )}
              </div>
              <Input
                placeholder={t("images.bannerUrl.placeholder")}
                value={formData.bannerUrl}
                onChange={(e) =>
                  setFormData({ ...formData, bannerUrl: e.target.value })
                }
              />
            </div>

            {/* Avatar Preview */}
            <div className="space-y-2">
              <Label>{t("images.avatar")}</Label>
              <div className="flex items-center gap-4">
                <Avatar className="size-20 border-2">
                  <AvatarImage
                    src={formData.avatarUrl || undefined}
                    alt={formData.username}
                  />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <User className="size-10" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <Input
                    placeholder={t("images.avatar")}
                    value={formData.avatarUrl}
                    onChange={(e) =>
                      setFormData({ ...formData, avatarUrl: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle>{t("account.title")}</CardTitle>
            <CardDescription>{t("account.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t("account.username")}</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
                placeholder={t("account.usernamePlaceholder")}
              />
              <p className="text-sm text-muted-foreground">
                {t("account.usernameHint", { username: formData.username })}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t("account.email")}</Label>
              <Input
                id="email"
                value={user.email}
                disabled
                className="bg-muted"
              />
              <p className="text-sm text-muted-foreground">
                {t("account.emailHint")}
              </p>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="allowNsfw"
                  checked={formData.allowNsfw}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, allowNsfw: !!checked })
                  }
                />
                <Label htmlFor="allowNsfw" className="cursor-pointer">
                  {t("allowNsfw.label")}
                </Label>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("allowNsfw.description")}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle>{t("password.title")}</CardTitle>
            <CardDescription>{t("password.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">{t("password.current")}</Label>
              <Input
                id="currentPassword"
                type="password"
                value={formData.currentPassword}
                onChange={(e) =>
                  setFormData({ ...formData, currentPassword: e.target.value })
                }
                placeholder={t("password.placeholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">{t("password.new")}</Label>
              <Input
                id="newPassword"
                type="password"
                value={formData.newPassword}
                onChange={(e) =>
                  setFormData({ ...formData, newPassword: e.target.value })
                }
                placeholder={t("password.placeholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("password.confirm")}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) =>
                  setFormData({ ...formData, confirmPassword: e.target.value })
                }
                placeholder={t("password.placeholder")}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {t("actions.cancel")}
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? t("actions.saving") : t("actions.save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
