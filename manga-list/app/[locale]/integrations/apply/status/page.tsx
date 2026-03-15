"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  getPublicIntegrationApplicationStatus,
  verifyPublicIntegrationApplicationDomain,
  type PublicIntegrationApplicationStatus,
} from "@/lib/integrations-api";

export default function PublicIntegrationApplicationStatusPage() {
  const t = useTranslations("PublicIntegrationsStatus");
  const searchParams = useSearchParams();
  const [applicationId, setApplicationId] = useState("");
  const [result, setResult] = useState<PublicIntegrationApplicationStatus | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifyingDomain, setIsVerifyingDomain] = useState(false);

  const loadStatus = useCallback(async (id: string) => {
    const normalizedId = id.trim();
    if (!normalizedId) {
      toast.error(t("messages.applicationIdRequired"));
      return;
    }

    setIsLoading(true);
    try {
      const data = await getPublicIntegrationApplicationStatus(normalizedId);
      setResult(data);
      toast.success(t("messages.statusLoadedSuccess"));
    } catch (error: unknown) {
      setResult(null);
      toast.error(getApiErrorMessage(error, t("messages.statusLoadError")));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const fromQuery = searchParams.get("applicationId")?.trim() || "";
    if (!fromQuery) return;
    setApplicationId((current) => current || fromQuery);
    void loadStatus(fromQuery);
  }, [loadStatus, searchParams]);

  const statusLabel = result
    ? t(`status.values.${result.status}`)
    : t("status.notLoaded");
  const nextActionLabel = result
    ? t(`nextAction.values.${result.nextAction}`)
    : t("nextAction.notLoaded");

  const handleVerifyDomain = async () => {
    if (!result?.id) return;

    setIsVerifyingDomain(true);
    try {
      const verification = await verifyPublicIntegrationApplicationDomain(result.id);
      setResult((current) =>
        current
          ? {
              ...current,
              verificationDomain: verification.verificationDomain,
              domainVerificationDnsRecordName:
                verification.domainVerificationDnsRecordName,
              domainVerificationToken: verification.domainVerificationToken,
              domainVerificationStatus: verification.domainVerificationStatus,
              domainVerificationError: verification.domainVerificationError,
              domainVerificationLastCheckedAt:
                verification.domainVerificationLastCheckedAt,
              domainVerifiedAt: verification.domainVerifiedAt,
            }
          : current,
      );
      toast.success(t("messages.verifyDomainSuccess"));
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t("messages.verifyDomainError")));
    } finally {
      setIsVerifyingDomain(false);
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
          <CardTitle>{t("lookup.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="application-id">{t("lookup.applicationIdLabel")}</Label>
            <Input
              id="application-id"
              placeholder={t("lookup.applicationIdPlaceholder")}
              value={applicationId}
              onChange={(event) => setApplicationId(event.target.value)}
            />
          </div>
          <Button
            onClick={() => void loadStatus(applicationId)}
            disabled={isLoading}
          >
            {isLoading ? t("lookup.loading") : t("lookup.submit")}
          </Button>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("result.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-md border bg-muted p-3 space-y-1">
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
                {statusLabel}
              </p>
              <p>
                <span className="font-medium">{t("result.nextAction")}:</span>{" "}
                {nextActionLabel}
              </p>
              <p>
                <span className="font-medium">
                  {t("result.domainVerificationStatus")}:
                </span>{" "}
                {t(
                  `result.domainVerificationValues.${result.domainVerificationStatus}`,
                )}
              </p>
              <p>
                <span className="font-medium">{t("result.verificationDomain")}:</span>{" "}
                {result.verificationDomain ?? t("result.notAvailable")}
              </p>
              <p>
                <span className="font-medium">{t("result.verificationToken")}:</span>{" "}
                <span className="font-mono break-all">
                  {result.domainVerificationToken ?? t("result.notAvailable")}
                </span>
              </p>
              <p>
                <span className="font-medium">{t("result.dnsRecordName")}:</span>{" "}
                <span className="font-mono break-all">
                  {result.domainVerificationDnsRecordName ??
                    t("result.notAvailable")}
                </span>
              </p>
              <p>
                <span className="font-medium">{t("result.wellKnownPath")}:</span>{" "}
                <span className="font-mono">/.well-known/manga-tracker-verification.txt</span>
              </p>
              {result.domainVerificationError ? (
                <p>
                  <span className="font-medium">
                    {t("result.domainVerificationError")}:
                  </span>{" "}
                  {result.domainVerificationError}
                </p>
              ) : null}
              <p>
                <span className="font-medium">
                  {t("result.domainVerificationLastCheckedAt")}:
                </span>{" "}
                {result.domainVerificationLastCheckedAt ?? t("result.notAvailable")}
              </p>
              <p>
                <span className="font-medium">{t("result.createdAt")}:</span>{" "}
                {result.createdAt}
              </p>
              <p>
                <span className="font-medium">{t("result.reviewedAt")}:</span>{" "}
                {result.reviewedAt ?? t("result.notAvailable")}
              </p>
              <p>
                <span className="font-medium">{t("result.updatedAt")}:</span>{" "}
                {result.updatedAt}
              </p>
              {result.reviewReason ? (
                <p>
                  <span className="font-medium">{t("result.reviewReason")}:</span>{" "}
                  {result.reviewReason}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleVerifyDomain()}
              disabled={isVerifyingDomain}
            >
              {isVerifyingDomain
                ? t("result.verifyingDomainButton")
                : t("result.verifyDomainButton")}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
