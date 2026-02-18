"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  Chrome,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";

export function RegisterForm() {
  const t = useTranslations("Auth.register");
  const router = useRouter();
  const { register } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const username = formData.get("username") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    // Validate password match
    if (password !== confirmPassword) {
      toast.error(t("error"), {
        description: t("passwordMismatch"),
      });
      setIsLoading(false);
      return;
    }

    try {
      await register(username, email, password);
      toast.success(t("success"), {
        description: t("successDescription"),
      });
      router.push("/my-track");
    } catch (error) {
      toast.error(t("error"), {
        description:
          error instanceof Error ? error.message : t("errorDescription"),
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-8 p-8 bg-card/50 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-1000">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-transparent">
          {t("title")}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="space-y-4">
          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">{t("usernameParams.label")}</Label>
            <div className="relative group">
              <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                id="username"
                name="username"
                placeholder={t("usernameParams.placeholder")}
                type="text"
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect="off"
                disabled={isLoading}
                className="pl-10 bg-background/50 border-input/50 focus:border-primary/50 focus:ring-primary/20 transition-all duration-300"
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("usernameParams.description")}
            </p>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">{t("emailParams.label")}</Label>
            <div className="relative group">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                id="email"
                name="email"
                placeholder={t("emailParams.placeholder")}
                type="email"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect="off"
                disabled={isLoading}
                className="pl-10 bg-background/50 border-input/50 focus:border-primary/50 focus:ring-primary/20 transition-all duration-300"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password">{t("passwordParams.label")}</Label>
            <div className="relative group">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                id="password"
                name="password"
                placeholder={t("passwordParams.placeholder")}
                type={showPassword ? "text" : "password"}
                disabled={isLoading}
                className="pl-10 pr-10 bg-background/50 border-input/50 focus:border-primary/50 focus:ring-primary/20 transition-all duration-300"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">
              {t("confirmPasswordParams.label")}
            </Label>
            <div className="relative group">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                id="confirmPassword"
                name="confirmPassword"
                placeholder={t("confirmPasswordParams.placeholder")}
                type={showConfirmPassword ? "text" : "password"}
                disabled={isLoading}
                className="pl-10 pr-10 bg-background/50 border-input/50 focus:border-primary/50 focus:ring-primary/20 transition-all duration-300"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-300 hover:scale-[1.02]"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <span className="flex items-center">
              {t("submit")} <ArrowRight className="ml-2 h-4 w-4" />
            </span>
          )}
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border/50" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            {t("divider")}
          </span>
        </div>
      </div>

      <Button
        variant="outline"
        type="button"
        disabled={isLoading}
        onClick={() =>
          (window.location.href = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/auth/google`)
        }
        className="w-full h-11 bg-background/50 border-input/50 hover:bg-accent hover:text-accent-foreground transition-all duration-300 hover:-translate-y-0.5"
      >
        <Chrome className="mr-2 h-4 w-4" />
        {t("google")}
      </Button>

      <p className="px-8 text-center text-sm text-muted-foreground">
        {t("hasAccount")}{" "}
        <Link
          href="/auth/login"
          className="underline underline-offset-4 hover:text-primary transition-colors"
        >
          {t("signIn")}
        </Link>
      </p>
    </div>
  );
}
