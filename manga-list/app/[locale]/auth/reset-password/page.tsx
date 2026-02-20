"use client";

import { useEffect, useState } from "react";
import { useRouter, Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { apiRequest, getApiErrorMessage } from "@/lib/api-client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(value);
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast.error("Reset token is missing.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      await apiRequest("/auth/reset-password", {
        method: "POST",
        body: {
          token,
          password,
          confirmPassword,
        },
      });

      toast.success("Password updated successfully.");
      router.push("/auth/login");
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, "Could not reset password"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6 p-8 bg-card/50 border border-border/50 rounded-2xl">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Reset Password</h1>
        <p className="text-sm text-muted-foreground">
          Set a new password for your account.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={10}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={10}
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Updating..." : "Update password"}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        Go back to{" "}
        <Link className="underline" href="/auth/login">
          login
        </Link>
        .
      </p>
    </div>
  );
}
