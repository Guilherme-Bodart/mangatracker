"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api-client";
import { createPublicIntegrationApplication } from "@/lib/integrations-api";

type TurnstileWidgetId = string | number;

type TurnstileRenderOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        target: HTMLElement | string,
        options: TurnstileRenderOptions,
      ) => TurnstileWidgetId;
      reset: (widgetId: TurnstileWidgetId) => void;
      remove: (widgetId: TurnstileWidgetId) => void;
    };
    __turnstileScriptPromise?: Promise<void>;
  }
}

const TURNSTILE_SCRIPT_ID = "cf-turnstile-script";

async function ensureTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.turnstile) return;
  if (window.__turnstileScriptPromise) {
    await window.__turnstileScriptPromise;
    return;
  }

  window.__turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(
      TURNSTILE_SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (existing) {
      if (window.turnstile) {
        resolve();
        return;
      }
      const waitUntilReady = () => {
        if (window.turnstile) {
          resolve();
          return;
        }
        window.setTimeout(waitUntilReady, 50);
      };
      waitUntilReady();
      return;
    }

    const script = document.createElement("script");
    script.id = TURNSTILE_SCRIPT_ID;
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Script load error"));
    document.head.appendChild(script);
  });

  await window.__turnstileScriptPromise;
}

export default function PublicIntegrationsApplyPage() {
  const t = useTranslations("PublicIntegrationsApply");
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetRef = useRef<TurnstileWidgetId | null>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";
  const [captchaToken, setCaptchaToken] = useState("");
  const [websiteTrap, setWebsiteTrap] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    id: string;
    requestedSlug: string;
    status: string;
  } | null>(null);
  const [form, setForm] = useState({
    requestedSlug: "",
    name: "",
    contactEmail: "",
    siteUrl: "",
    allowedDomains: "",
    useCase: "",
  });

  useEffect(() => {
    if (!turnstileSiteKey || !turnstileContainerRef.current) {
      return;
    }

    let mounted = true;
    void ensureTurnstileScript()
      .then(() => {
        if (!mounted || !turnstileContainerRef.current || !window.turnstile) {
          return;
        }
        if (turnstileWidgetRef.current !== null) {
          return;
        }

        turnstileWidgetRef.current = window.turnstile.render(
          turnstileContainerRef.current,
          {
            sitekey: turnstileSiteKey,
            callback: (token) => setCaptchaToken(token),
            "expired-callback": () => setCaptchaToken(""),
            "error-callback": () => setCaptchaToken(""),
          },
        );
      })
      .catch(() => {
        toast.error(t("messages.captchaLoadError"));
      });

    return () => {
      mounted = false;
      if (window.turnstile && turnstileWidgetRef.current !== null) {
        window.turnstile.remove(turnstileWidgetRef.current);
        turnstileWidgetRef.current = null;
      }
    };
  }, [t, turnstileSiteKey]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (turnstileSiteKey && !captchaToken.trim()) {
      toast.error(t("messages.captchaRequired"));
      return;
    }

    setIsSubmitting(true);
    try {
      const allowedDomains = form.allowedDomains
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const created = await createPublicIntegrationApplication({
        requestedSlug: form.requestedSlug.trim().toLowerCase(),
        name: form.name.trim(),
        contactEmail: form.contactEmail.trim().toLowerCase(),
        siteUrl: form.siteUrl.trim(),
        allowedDomains,
        useCase: form.useCase.trim() || undefined,
        captchaToken: captchaToken.trim() || undefined,
        website: websiteTrap || undefined,
      });

      setResult({
        id: created.id,
        requestedSlug: created.requestedSlug,
        status: created.status,
      });
      toast.success(t("messages.submitSuccess"));
      setForm({
        requestedSlug: "",
        name: "",
        contactEmail: "",
        siteUrl: "",
        allowedDomains: "",
        useCase: "",
      });
      setWebsiteTrap("");
      setCaptchaToken("");
      if (window.turnstile && turnstileWidgetRef.current !== null) {
        window.turnstile.reset(turnstileWidgetRef.current);
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t("messages.submitError")));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-10 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("form.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="requestedSlug">{t("form.requestedSlugLabel")}</Label>
              <Input
                id="requestedSlug"
                placeholder={t("form.requestedSlugPlaceholder")}
                value={form.requestedSlug}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    requestedSlug: event.target.value,
                  }))
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">{t("form.nameLabel")}</Label>
              <Input
                id="name"
                placeholder={t("form.namePlaceholder")}
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contactEmail">{t("form.contactEmailLabel")}</Label>
                <Input
                  id="contactEmail"
                  type="email"
                  placeholder={t("form.contactEmailPlaceholder")}
                  value={form.contactEmail}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      contactEmail: event.target.value,
                    }))
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="siteUrl">{t("form.siteUrlLabel")}</Label>
                <Input
                  id="siteUrl"
                  type="url"
                  placeholder={t("form.siteUrlPlaceholder")}
                  value={form.siteUrl}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      siteUrl: event.target.value,
                    }))
                  }
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="allowedDomains">{t("form.allowedDomainsLabel")}</Label>
              <Input
                id="allowedDomains"
                placeholder={t("form.allowedDomainsPlaceholder")}
                value={form.allowedDomains}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    allowedDomains: event.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("form.allowedDomainsHint")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="useCase">{t("form.useCaseLabel")}</Label>
              <Textarea
                id="useCase"
                placeholder={t("form.useCasePlaceholder")}
                value={form.useCase}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    useCase: event.target.value,
                  }))
                }
                rows={4}
              />
            </div>

            <div className="absolute -left-[9999px] -top-[9999px]" aria-hidden>
              <Label htmlFor="website">{t("form.websiteTrapLabel")}</Label>
              <Input
                id="website"
                tabIndex={-1}
                autoComplete="off"
                value={websiteTrap}
                onChange={(event) => setWebsiteTrap(event.target.value)}
              />
            </div>

            {turnstileSiteKey ? (
              <div className="space-y-2">
                <Label>{t("form.captchaLabel")}</Label>
                <div ref={turnstileContainerRef} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("form.captchaDisabled")}
              </p>
            )}

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("form.submitting") : t("form.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("result.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("result.body")}</p>
            <div className="rounded-md border bg-muted p-3 space-y-1 text-sm">
              <p>
                <span className="font-medium">{t("result.applicationId")}:</span>{" "}
                <span className="font-mono break-all">{result.id}</span>
              </p>
              <p>
                <span className="font-medium">{t("result.requestedSlug")}:</span>{" "}
                {result.requestedSlug}
              </p>
              <p>
                <span className="font-medium">{t("result.status")}:</span>{" "}
                {result.status}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(result.id);
                    toast.success(t("messages.copyIdSuccess"));
                  } catch {
                    toast.error(t("messages.copyIdError"));
                  }
                }}
              >
                {t("result.copyIdButton")}
              </Button>
              <Button asChild>
                <Link
                  href={{
                    pathname: "/integrations/apply/status",
                    query: { applicationId: result.id },
                  }}
                >
                  {t("result.checkStatusButton")}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
