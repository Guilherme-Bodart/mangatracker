"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api-client";
import { useTranslations } from "next-intl";
import {
  listConnectablePartners,
  startIntegrationConnect,
  type ConnectablePartner,
} from "@/lib/integrations-api";

export default function IntegrationsPage() {
  const t = useTranslations("ProfileIntegrations");
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const [partners, setPartners] = useState<ConnectablePartner[]>([]);
  const [isLoadingPartners, setIsLoadingPartners] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
          setPartnerSlug((current) => current || data[0].slug);
          setSourceDomain((current) =>
            current || data[0].allowedDomains[0] || "",
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
  }, [user]);

  const selectedPartner = useMemo(
    () => partners.find((partner) => partner.slug === partnerSlug),
    [partners, partnerSlug],
  );

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

            <Button type="submit" disabled={isSubmitting || isLoadingPartners}>
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
