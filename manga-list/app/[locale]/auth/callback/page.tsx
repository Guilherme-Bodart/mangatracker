"use client";

import { useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiRequest, getApiErrorMessage } from "@/lib/api-client";
import { useRouter } from "@/i18n/routing";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      toast.error("Authentication failed", {
        description: "Missing OAuth verification data",
      });
      router.push("/auth/login");
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

        router.push("/my-track");
      } catch (error: unknown) {
        toast.error("Authentication failed", {
          description: getApiErrorMessage(error, "Could not complete social login"),
        });
        router.push("/auth/login");
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
