"use client";

import { useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiRequest, getApiErrorMessage } from "@/lib/api-client";
import { useRouter } from "@/i18n/routing";
import { trackLogin } from "@/components/analytics/google-analytics-events";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  useEffect(() => {
    const redirectToLoginWithOAuthError = (
      stage: string,
      message: string,
      code?: string,
    ) => {
      sessionStorage.setItem(
        "oauth_login_error",
        JSON.stringify({
          stage,
          code,
          message,
          createdAt: Date.now(),
        }),
      );
      router.push("/auth/login");
    };

    const searchParams = new URLSearchParams(window.location.search);
    const error = searchParams.get("error");
    const errorCode = searchParams.get("code");
    const errorMessage = searchParams.get("message");
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (error) {
      const message =
        errorMessage ||
        "Could not complete Google login. Please try signing in again.";
      toast.error("Authentication failed", {
        description: message,
      });
      redirectToLoginWithOAuthError("google_callback", message, errorCode || error);
      return;
    }

    if (!code || !state) {
      const message = "Missing OAuth verification data";
      toast.error("Authentication failed", {
        description: message,
      });
      redirectToLoginWithOAuthError("frontend_callback", message);
      return;
    }

    const exchangeCode = async () => {
      try {
        await apiRequest("/auth/exchange", {
          method: "POST",
          body: { code, state },
        });
        const refreshedUser = await refreshUser();
        if (!refreshedUser) {
          throw new Error("Could not establish authenticated session");
        }

        toast.success("Login successful!", {
          description: "Welcome back!",
        });
        trackLogin("google");

        router.push("/my-track");
      } catch (error: unknown) {
        const message = getApiErrorMessage(error, "Could not complete social login");
        toast.error("Authentication failed", {
          description: message,
        });
        redirectToLoginWithOAuthError("exchange_or_session", message);
      }
    };

    exchangeCode();
  }, [router, refreshUser]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
        <p className="text-muted-foreground">Completing authentication...</p>
      </div>
    </div>
  );
}
