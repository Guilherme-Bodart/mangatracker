"use client";

import { useState } from "react";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type ForgotPasswordResponse = {
  success: boolean;
  resetToken?: string;
  resetUrl?: string;
};

export default function ForgotPasswordPage() {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setDevResetUrl(null);

    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error("Could not request password reset");
      }

      const data = (await response.json()) as ForgotPasswordResponse;
      if (data.resetUrl) {
        setDevResetUrl(data.resetUrl);
      }

      toast.success(
        "If this e-mail exists, a password reset link has been generated.",
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not request password reset",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6 p-8 bg-card/50 border border-border/50 rounded-2xl">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Forgot Password</h1>
        <p className="text-sm text-muted-foreground">
          Enter your account e-mail and we will send a reset link.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Sending..." : "Send reset link"}
        </Button>
      </form>

      {devResetUrl && (
        <div className="rounded-md border border-dashed p-3 text-sm">
          <p className="font-medium mb-1">Development reset link:</p>
          <a className="underline break-all" href={devResetUrl}>
            {devResetUrl}
          </a>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Remembered your password?{" "}
        <Link className="underline" href="/auth/login">
          Back to login
        </Link>
      </p>
    </div>
  );
}
