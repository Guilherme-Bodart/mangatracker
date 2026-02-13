"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();

  useEffect(() => {
    const code = searchParams.get("code");

    if (!code) {
      toast.error("Authentication failed", {
        description: "No authentication code received from server",
      });
      router.push("/auth/login");
      return;
    }

    const exchangeCode = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const response = await fetch(`${API_URL}/auth/exchange`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          throw new Error("Failed to exchange authentication code");
        }

        await response.json();
        await refreshUser();

        toast.success("Login successful!", {
          description: "Welcome back!",
        });

        router.push("/my-track");
      } catch {
        toast.error("Authentication failed", {
          description: "Could not complete social login",
        });
        router.push("/auth/login");
      }
    };

    exchangeCode();
  }, [searchParams, router, refreshUser]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
        <p className="text-muted-foreground">Completing authentication...</p>
      </div>
    </div>
  );
}
