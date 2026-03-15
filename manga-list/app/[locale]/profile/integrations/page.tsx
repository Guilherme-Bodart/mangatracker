"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/routing";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api-client";
import { getApiBaseUrl } from "@/lib/api-config";
import { useTranslations } from "next-intl";
import {
  listConnectablePartners,
  startIntegrationConnect,
  type ConnectablePartner,
} from "@/lib/integrations-api";

type ExtensionConnectRequest = {
  enabled: boolean;
  extensionId: string;
  partnerSlug: string;
  sourceDomain: string;
  apiBaseUrl: string;
};

function parseExtensionConnectRequest(
  searchParams: { get: (key: string) => string | null },
): ExtensionConnectRequest {
  const extensionId = (searchParams.get("mt_ext_id") || "").trim();
  const enabled =
    searchParams.get("mt_ext_connect") === "1" && extensionId.length > 0;

  return {
    enabled,
    extensionId,
    partnerSlug: (searchParams.get("mt_partner_slug") || "")
      .trim()
      .toLowerCase(),
    sourceDomain: (searchParams.get("mt_source_domain") || "")
      .trim()
      .toLowerCase(),
    apiBaseUrl: (searchParams.get("mt_api_base") || "").trim(),
  };
}

function sendConnectCodeToExtension(
  extensionId: string,
  payload: {
    partnerSlug: string;
    code: string;
    sourceDomain?: string;
    apiBaseUrl?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const runtime = (
      globalThis as typeof globalThis & {
        chrome?: {
          runtime?: {
            sendMessage?: (
              extensionIdArg: string,
              message: unknown,
              callback: (response?: { ok?: boolean; error?: string }) => void,
            ) => void;
            lastError?: {
              message?: string;
            };
          };
        };
      }
    ).chrome?.runtime;

    if (!runtime?.sendMessage) {
      resolve({
        ok: false,
        error: "chrome.runtime.sendMessage is not available in this browser",
      });
      return;
    }

    try {
      runtime.sendMessage(
        extensionId,
        {
          type: "MANGA_TRACKER_CONNECT_CODE",
          payload,
        },
        (response) => {
          const runtimeError = runtime.lastError?.message;
          if (runtimeError) {
            resolve({ ok: false, error: runtimeError });
            return;
          }

          if (!response?.ok) {
            resolve({
              ok: false,
              error: response?.error || "Extension rejected the connect code",
            });
            return;
          }

          resolve({ ok: true });
        },
      );
    } catch (error) {
      resolve({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to send connect code to extension",
      });
    }
  });
}

export default function IntegrationsPage() {
  const t = useTranslations("ProfileIntegrations");
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoConnectStartedRef = useRef(false);

  const extensionConnectRequest = useMemo(
    () => parseExtensionConnectRequest(searchParams),
    [searchParams],
  );

  const [partners, setPartners] = useState<ConnectablePartner[]>([]);
  const [isLoadingPartners, setIsLoadingPartners] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [expiresInMs, setExpiresInMs] = useState(0);
  const [partnerSlug, setPartnerSlug] = useState("");
  const [sourceDomain, setSourceDomain] = useState("");

  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/auth/login");
    }
  }, [isAuthLoading, user, router]);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setIsLoadingPartners(true);
      try {
        const data = await listConnectablePartners();
        setPartners(data);
        if (data.length > 0) {
          const requestedPartner = extensionConnectRequest.partnerSlug
            ? data.find((partner) => partner.slug === extensionConnectRequest.partnerSlug)
            : null;
          const defaultPartner = requestedPartner || data[0];

          setPartnerSlug((current) => current || defaultPartner.slug);
          setSourceDomain((current) =>
            current ||
            extensionConnectRequest.sourceDomain ||
            defaultPartner.allowedDomains[0] ||
            "",
          );
        }
      } catch (error: unknown) {
        toast.error(
          getApiErrorMessage(error, t("messages.loadPartnersError")),
        );
      } finally {
        setIsLoadingPartners(false);
      }
    };

    void load();
  }, [extensionConnectRequest.partnerSlug, extensionConnectRequest.sourceDomain, t, user]);

  const selectedPartner = useMemo(
    () => partners.find((partner) => partner.slug === partnerSlug),
    [partners, partnerSlug],
  );

  useEffect(() => {
    if (!user) return;
    if (!extensionConnectRequest.enabled) return;
    if (isLoadingPartners || partners.length === 0) return;
    if (autoConnectStartedRef.current) return;

    autoConnectStartedRef.current = true;

    const targetPartnerSlug =
      extensionConnectRequest.partnerSlug || partnerSlug || partners[0]?.slug || "";
    const targetPartner = partners.find((partner) => partner.slug === targetPartnerSlug);

    if (!targetPartner) {
      toast.error(t("messages.selectPartnerError"));
      return;
    }

    const targetSourceDomain = (
      extensionConnectRequest.sourceDomain ||
      sourceDomain ||
      targetPartner.allowedDomains[0] ||
      ""
    )
      .trim()
      .toLowerCase();

    setPartnerSlug(targetPartner.slug);
    setSourceDomain(targetSourceDomain);

    const connectAutomatically = async () => {
      setIsAutoConnecting(true);
      setIsSubmitting(true);
      try {
        const result = await startIntegrationConnect({
          partnerSlug: targetPartner.slug,
          sourceDomain: targetSourceDomain || undefined,
          scopes: ["manga:write"],
        });

        setGeneratedCode(result.code);
        setExpiresInMs(result.expiresInMs);

        const delivery = await sendConnectCodeToExtension(
          extensionConnectRequest.extensionId,
          {
            partnerSlug: targetPartner.slug,
            code: result.code,
            sourceDomain: targetSourceDomain || undefined,
            apiBaseUrl: extensionConnectRequest.apiBaseUrl || getApiBaseUrl(),
          },
        );

        if (delivery.ok) {
          toast.success(t("messages.extensionConnectedSuccess"));
          return;
        }

        toast.error(
          t("messages.extensionConnectError", {
            error: delivery.error || "unknown",
          }),
        );
      } catch (error: unknown) {
        toast.error(getApiErrorMessage(error, t("messages.generateCodeError")));
      } finally {
        setIsAutoConnecting(false);
        setIsSubmitting(false);
      }
    };

    void connectAutomatically();
  }, [
    extensionConnectRequest.apiBaseUrl,
    extensionConnectRequest.enabled,
    extensionConnectRequest.extensionId,
    extensionConnectRequest.partnerSlug,
    extensionConnectRequest.sourceDomain,
    isLoadingPartners,
    partnerSlug,
    partners,
    sourceDomain,
    t,
    user,
  ]);

  if (isAuthLoading || !user) {
    return null;
  }

  const handleGenerateCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!partnerSlug) {
      toast.error(t("messages.selectPartnerError"));
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await startIntegrationConnect({
        partnerSlug,
        sourceDomain: sourceDomain || undefined,
        scopes: ["manga:write"],
      });
      setGeneratedCode(result.code);
      setExpiresInMs(result.expiresInMs);
      toast.success(t("messages.codeGeneratedSuccess"));
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t("messages.generateCodeError")));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-3xl py-8 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">
          {t("subtitle")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("connectCard.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {extensionConnectRequest.enabled ? (
            <p className="mb-3 text-sm text-muted-foreground">
              {isAutoConnecting
                ? t("connectCard.extensionModeConnecting")
                : t("connectCard.extensionModeReady")}
            </p>
          ) : null}

          <form className="space-y-4" onSubmit={handleGenerateCode}>
            <div className="space-y-2">
              <Label>{t("connectCard.partnerLabel")}</Label>
              <Select
                value={partnerSlug}
                onValueChange={(value) => {
                  setPartnerSlug(value);
                  const partner = partners.find((item) => item.slug === value);
                  setSourceDomain(partner?.allowedDomains[0] ?? "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("connectCard.partnerPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((partner) => (
                    <SelectItem key={partner.id} value={partner.slug}>
                      {partner.name} ({partner.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("connectCard.sourceDomainLabel")}</Label>
              <Input
                value={sourceDomain}
                onChange={(event) => setSourceDomain(event.target.value)}
                placeholder={t("connectCard.sourceDomainPlaceholder")}
              />
              {selectedPartner?.allowedDomains?.length ? (
                <p className="text-sm text-muted-foreground">
                  {t("connectCard.allowedDomainsPrefix")}{" "}
                  {selectedPartner.allowedDomains.join(", ")}
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || isLoadingPartners || isAutoConnecting}
            >
              {isSubmitting
                ? t("connectCard.generating")
                : t("connectCard.generateButton")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {generatedCode ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("codeCard.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted px-3 py-2 font-mono text-sm break-all">
              {generatedCode}
            </div>
            <p className="text-sm text-muted-foreground">
              {t("codeCard.expiresInfo", {
                minutes: Math.floor(expiresInMs / 60000),
              })}
            </p>
            {extensionConnectRequest.enabled ? (
              <p className="text-sm text-muted-foreground">
                {t("codeCard.extensionFallbackInfo")}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(generatedCode);
                  toast.success(t("messages.codeCopiedSuccess"));
                } catch {
                  toast.error(t("messages.codeCopyError"));
                }
              }}
            >
              {t("codeCard.copyButton")}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
