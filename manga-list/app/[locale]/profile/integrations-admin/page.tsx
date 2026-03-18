"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ApiClientError, getApiErrorMessage } from "@/lib/api-client";
import { useTranslations } from "next-intl";
import {
  approveAdminApplication,
  createAdminPartner,
  getIntegrationConnectionStatus,
  listAdminApplications,
  listAdminConnections,
  listAdminPartners,
  rejectAdminApplication,
  revokeAdminConnection,
  rotateAdminPartnerSecret,
  updateAdminPartner,
  verifyPublicIntegrationApplicationDomain,
  type AdminPartner,
  type IntegrationApplication,
  type IntegrationApplicationStatus,
  type IntegrationConnectionStatus,
  type IntegrationConnection,
} from "@/lib/integrations-api";

export default function IntegrationsAdminPage() {
  const t = useTranslations("ProfileIntegrationsAdmin");
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [partners, setPartners] = useState<AdminPartner[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [applications, setApplications] = useState<IntegrationApplication[]>([]);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [newSecretRotationInfo, setNewSecretRotationInfo] = useState<{
    previousSecretExpiresAt: string;
    transitionWindowHours: number;
  } | null>(null);
  const [statusToken, setStatusToken] = useState("");
  const [statusResult, setStatusResult] =
    useState<IntegrationConnectionStatus | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [createForm, setCreateForm] = useState({
    slug: "",
    name: "",
    allowedDomains: "",
    isActive: true,
  });
  const [connectionFilter, setConnectionFilter] = useState("");
  const [applicationStatusFilter, setApplicationStatusFilter] = useState<
    "" | IntegrationApplicationStatus
  >("PENDING");
  const getSecretRotation = (partner: AdminPartner) =>
    partner.secretRotation ?? {
      previousSecretExpiresAt: null,
      previousSecretActive: false,
      lastPreviousSecretUsedAt: null,
    };

  const handleForbidden = useCallback(() => {
    toast.error(t("messages.forbidden"));
    router.replace("/profile");
  }, [router, t]);

  const handleApiError = useCallback(
    (error: unknown, fallbackMessage: string) => {
      if (error instanceof ApiClientError && error.status === 403) {
        handleForbidden();
        return;
      }

      toast.error(getApiErrorMessage(error, fallbackMessage));
    },
    [handleForbidden],
  );

  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/auth/login");
    }
  }, [isAuthLoading, user, router]);

  const loadData = useCallback(
    async (
      partnerSlug?: string,
      applicationStatus?: "" | IntegrationApplicationStatus,
    ) => {
      setIsLoading(true);
      try {
        const [partnersData, connectionsData, applicationsData] = await Promise.all([
          listAdminPartners(),
          listAdminConnections(partnerSlug),
          listAdminApplications(applicationStatus || undefined),
        ]);
        setPartners(partnersData);
        setConnections(connectionsData);
        setApplications(applicationsData);
      } catch (error: unknown) {
        handleApiError(error, t("messages.loadDataError"));
      } finally {
        setIsLoading(false);
      }
    },
    [handleApiError, t],
  );

  useEffect(() => {
    if (!user) return;
    void loadData(undefined, applicationStatusFilter || undefined);
  }, [applicationStatusFilter, loadData, user]);

  const partnerOptions = useMemo(
    () => [{ slug: "", label: t("connections.allPartners") }].concat(
      partners.map((partner) => ({
        slug: partner.slug,
        label: `${partner.name} (${partner.slug})`,
      })),
    ),
    [partners, t],
  );

  const statusCheckLabels = useMemo(
    () => [
      {
        key: "partnerExists",
        label: t("connectionStatus.checks.partnerExists"),
      },
      {
        key: "partnerActive",
        label: t("connectionStatus.checks.partnerActive"),
      },
      {
        key: "connectionExists",
        label: t("connectionStatus.checks.connectionExists"),
      },
      {
        key: "connectionActive",
        label: t("connectionStatus.checks.connectionActive"),
      },
      {
        key: "tokenHasWriteScope",
        label: t("connectionStatus.checks.tokenHasWriteScope"),
      },
      {
        key: "connectionHasWriteScope",
        label: t("connectionStatus.checks.connectionHasWriteScope"),
      },
    ],
    [t],
  );

  if (isAuthLoading || !user) {
    return null;
  }

  const handleCreatePartner = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const created = await createAdminPartner({
        slug: createForm.slug.trim(),
        name: createForm.name.trim(),
        allowedDomains: createForm.allowedDomains
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        isActive: createForm.isActive,
      });
      setNewSecret(created.clientSecret);
      setNewSecretRotationInfo(null);
      toast.success(t("messages.partnerCreatedSuccess"));
      setCreateForm({ slug: "", name: "", allowedDomains: "", isActive: true });
      await loadData(
        connectionFilter || undefined,
        applicationStatusFilter || undefined,
      );
    } catch (error: unknown) {
      handleApiError(error, t("messages.createPartnerError"));
    }
  };

  const handleTogglePartner = async (partner: AdminPartner) => {
    try {
      await updateAdminPartner(partner.id, { isActive: !partner.isActive });
      toast.success(t("messages.partnerStatusUpdatedSuccess"));
      await loadData(
        connectionFilter || undefined,
        applicationStatusFilter || undefined,
      );
    } catch (error: unknown) {
      handleApiError(error, t("messages.updatePartnerError"));
    }
  };

  const handleRotateSecret = async (partner: AdminPartner) => {
    try {
      const rotated = await rotateAdminPartnerSecret(partner.id);
      setNewSecret(rotated.clientSecret);
      setNewSecretRotationInfo({
        previousSecretExpiresAt: rotated.previousSecretExpiresAt,
        transitionWindowHours: rotated.transitionWindowHours,
      });
      toast.success(t("messages.secretRotatedSuccess", { slug: partner.slug }));
    } catch (error: unknown) {
      handleApiError(error, t("messages.rotateSecretError"));
    }
  };

  const handleRevokeConnection = async (connectionId: string) => {
    try {
      await revokeAdminConnection(connectionId);
      toast.success(t("messages.connectionRevokedSuccess"));
      await loadData(
        connectionFilter || undefined,
        applicationStatusFilter || undefined,
      );
    } catch (error: unknown) {
      handleApiError(error, t("messages.revokeConnectionError"));
    }
  };

  const handleApproveApplication = async (application: IntegrationApplication) => {
    try {
      const approved = await approveAdminApplication(application.id, {
        slug: application.requestedSlug,
        name: application.name,
        allowedDomains: application.allowedDomains,
      });
      setNewSecret(approved.partner.clientSecret);
      setNewSecretRotationInfo(null);
      toast.success(
        t("messages.applicationApprovedSuccess", { slug: application.requestedSlug }),
      );
      await loadData(
        connectionFilter || undefined,
        applicationStatusFilter || undefined,
      );
    } catch (error: unknown) {
      handleApiError(error, t("messages.approveApplicationError"));
    }
  };

  const handleRejectApplication = async (application: IntegrationApplication) => {
    try {
      const reason =
        window.prompt(t("applications.rejectPrompt"), application.reviewReason ?? "") ??
        "";
      await rejectAdminApplication(application.id, {
        reason: reason.trim() || undefined,
      });
      toast.success(
        t("messages.applicationRejectedSuccess", { slug: application.requestedSlug }),
      );
      await loadData(
        connectionFilter || undefined,
        applicationStatusFilter || undefined,
      );
    } catch (error: unknown) {
      handleApiError(error, t("messages.rejectApplicationError"));
    }
  };

  const handleVerifyApplicationDomain = async (
    application: IntegrationApplication,
  ) => {
    try {
      await verifyPublicIntegrationApplicationDomain(application.id);
      toast.success(t("messages.applicationDomainVerifiedSuccess"));
      await loadData(
        connectionFilter || undefined,
        applicationStatusFilter || undefined,
      );
    } catch (error: unknown) {
      handleApiError(error, t("messages.applicationDomainVerifyError"));
    }
  };

  const handleCheckConnectionStatus = async () => {
    if (!statusToken.trim()) {
      toast.error(t("messages.connectionStatusTokenRequired"));
      return;
    }

    setIsCheckingStatus(true);
    try {
      const result = await getIntegrationConnectionStatus(statusToken.trim());
      setStatusResult(result);
      toast.success(t("messages.connectionStatusLoadedSuccess"));
    } catch (error: unknown) {
      setStatusResult(null);
      handleApiError(error, t("messages.connectionStatusLoadError"));
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return t("partners.notAvailable");
    return new Date(value).toLocaleString();
  };

  return (
    <div className="container mx-auto max-w-5xl py-8 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">
          {t("subtitle")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("createCard.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreatePartner}>
            <div className="space-y-2">
              <Label>{t("createCard.slugLabel")}</Label>
              <Input
                placeholder={t("createCard.slugPlaceholder")}
                value={createForm.slug}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, slug: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("createCard.nameLabel")}</Label>
              <Input
                placeholder={t("createCard.namePlaceholder")}
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>{t("createCard.allowedDomainsLabel")}</Label>
              <Input
                placeholder={t("createCard.allowedDomainsPlaceholder")}
                value={createForm.allowedDomains}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    allowedDomains: event.target.value,
                  }))
                }
              />
            </div>
            <div className="md:col-span-2 flex items-center space-x-2">
              <Checkbox
                id="is-active"
                checked={createForm.isActive}
                onCheckedChange={(checked) =>
                  setCreateForm((prev) => ({ ...prev, isActive: !!checked }))
                }
              />
              <Label htmlFor="is-active">{t("createCard.activeLabel")}</Label>
            </div>
            <div className="md:col-span-2">
              <Button type="submit">{t("createCard.submitButton")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {newSecret ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("secretCard.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border bg-muted px-3 py-2 font-mono text-sm break-all">
              {newSecret}
            </div>
            <p className="text-sm text-muted-foreground">
              {t("secretCard.description")}
            </p>
            {newSecretRotationInfo ? (
              <p className="text-sm text-muted-foreground">
                {t("secretCard.rotationWindowInfo", {
                  hours: newSecretRotationInfo.transitionWindowHours,
                  expiresAt: new Date(
                    newSecretRotationInfo.previousSecretExpiresAt,
                  ).toLocaleString(),
                })}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("connectionStatus.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("connectionStatus.description")}
          </p>
          <div className="space-y-2">
            <Label>{t("connectionStatus.tokenLabel")}</Label>
            <Input
              value={statusToken}
              onChange={(event) => setStatusToken(event.target.value)}
              placeholder={t("connectionStatus.tokenPlaceholder")}
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => void handleCheckConnectionStatus()}
              disabled={isCheckingStatus}
            >
              {isCheckingStatus
                ? t("connectionStatus.checkingButton")
                : t("connectionStatus.checkButton")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setStatusToken("");
                setStatusResult(null);
              }}
            >
              {t("connectionStatus.clearButton")}
            </Button>
          </div>

          {statusResult ? (
            <div className="rounded-md border p-3 space-y-2 text-sm">
              <p className="font-medium">
                {statusResult.connected
                  ? t("connectionStatus.connected")
                  : t("connectionStatus.disconnected")}
              </p>
              <p className="text-muted-foreground">
                {t("connectionStatus.partnerLabel")} {statusResult.partner.slug} (
                {statusResult.partner.id})
              </p>
              <p className="text-muted-foreground">
                {t("connectionStatus.scopesLabel")}{" "}
                {statusResult.scopes.length
                  ? statusResult.scopes.join(", ")
                  : t("connectionStatus.noScopes")}
              </p>
              <p className="text-muted-foreground">
                {t("connectionStatus.tokenExpiresAtLabel")}{" "}
                {statusResult.tokenExpiresAt ?? t("connectionStatus.notAvailable")}
              </p>
              <p className="text-muted-foreground">
                {t("connectionStatus.connectionIdLabel")}{" "}
                {statusResult.connectionId ?? t("connectionStatus.notAvailable")}
              </p>
              <p className="text-muted-foreground">
                {t("connectionStatus.connectionUpdatedAtLabel")}{" "}
                {statusResult.connectionUpdatedAt ??
                  t("connectionStatus.notAvailable")}
              </p>
              <div className="pt-2 space-y-1">
                <p className="font-medium">{t("connectionStatus.checksTitle")}</p>
                {statusCheckLabels.map((item) => {
                  const value = statusResult.checks[
                    item.key as keyof IntegrationConnectionStatus["checks"]
                  ];
                  return (
                    <p key={item.key} className="text-muted-foreground">
                      {item.label}:{" "}
                      {value
                        ? t("connectionStatus.checkOk")
                        : t("connectionStatus.checkFail")}
                    </p>
                  );
                })}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("partners.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {partners.map((partner) => (
            <div
              key={partner.id}
              className="rounded-md border p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium">
                  {partner.name} ({partner.slug})
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("partners.domainsLabel")}{" "}
                  {partner.allowedDomains.length
                    ? partner.allowedDomains.join(", ")
                    : t("partners.noDomainRestriction")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("partners.statusLabel")}{" "}
                  {partner.isActive
                    ? t("partners.statusActive")
                    : t("partners.statusInactive")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("partners.previousSecretWindowLabel")}{" "}
                  {getSecretRotation(partner).previousSecretActive
                    ? t("partners.previousSecretWindowActive")
                    : t("partners.previousSecretWindowInactive")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("partners.previousSecretExpiresAtLabel")}{" "}
                  {formatDateTime(getSecretRotation(partner).previousSecretExpiresAt)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("partners.lastPreviousSecretUsedAtLabel")}{" "}
                  {formatDateTime(getSecretRotation(partner).lastPreviousSecretUsedAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => void handleTogglePartner(partner)}
                >
                  {partner.isActive
                    ? t("partners.deactivateButton")
                    : t("partners.activateButton")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleRotateSecret(partner)}
                >
                  {t("partners.rotateSecretButton")}
                </Button>
              </div>
            </div>
          ))}
          {!partners.length && !isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t("partners.empty")}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("applications.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { value: "", label: t("applications.filters.all") },
              { value: "PENDING", label: t("applications.filters.pending") },
              { value: "APPROVED", label: t("applications.filters.approved") },
              { value: "REJECTED", label: t("applications.filters.rejected") },
            ].map((option) => (
              <Button
                key={option.value || "all"}
                variant={applicationStatusFilter === option.value ? "default" : "outline"}
                onClick={() => {
                  const nextValue = option.value as "" | IntegrationApplicationStatus;
                  setApplicationStatusFilter(nextValue);
                  void loadData(connectionFilter || undefined, nextValue || undefined);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {applications.map((application) => (
            <div
              key={application.id}
              className="rounded-md border p-3 flex flex-col gap-3"
            >
              <div>
                <p className="font-medium">
                  {application.name} ({application.requestedSlug})
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("applications.contactLabel")} {application.contactEmail}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("applications.siteLabel")} {application.siteUrl}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("applications.domainsLabel")}{" "}
                  {application.allowedDomains.length
                    ? application.allowedDomains.join(", ")
                    : t("applications.noDomainRestriction")}
                </p>
                {application.useCase ? (
                  <p className="text-sm text-muted-foreground">
                    {t("applications.useCaseLabel")} {application.useCase}
                  </p>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  {t("applications.statusLabel")} {application.status}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("applications.domainVerificationStatusLabel")}{" "}
                  {application.domainVerificationStatus}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("applications.verificationDomainLabel")}{" "}
                  {application.verificationDomain ?? t("applications.notAvailable")}
                </p>
                {application.domainVerificationError ? (
                  <p className="text-sm text-muted-foreground">
                    {t("applications.domainVerificationErrorLabel")}{" "}
                    {application.domainVerificationError}
                  </p>
                ) : null}
                {application.reviewReason ? (
                  <p className="text-sm text-muted-foreground">
                    {t("applications.reviewReasonLabel")} {application.reviewReason}
                  </p>
                ) : null}
              </div>
              {application.status === "PENDING" ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void handleVerifyApplicationDomain(application)}
                  >
                    {t("applications.verifyDomainButton")}
                  </Button>
                  <Button
                    onClick={() => void handleApproveApplication(application)}
                  >
                    {t("applications.approveButton")}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => void handleRejectApplication(application)}
                  >
                    {t("applications.rejectButton")}
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          {!applications.length && !isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t("applications.empty")}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("connections.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={connectionFilter}
              onChange={(event) => setConnectionFilter(event.target.value)}
              placeholder={t("connections.filterPlaceholder")}
            />
            <Button onClick={() => void loadData(connectionFilter || undefined)}>
              {t("connections.filterButton")}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {partnerOptions.map((option) => (
              <Button
                key={option.slug || "all"}
                variant={connectionFilter === option.slug ? "default" : "outline"}
                onClick={() => {
                  setConnectionFilter(option.slug);
                  void loadData(option.slug || undefined);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {connections.map((connection) => (
            <div
              key={connection.id}
              className="rounded-md border p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium">
                  {connection.user.username} ({connection.user.email})
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("connections.partnerLabel")} {connection.partner.name} (
                  {connection.partner.slug})
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("connections.scopesLabel")}{" "}
                  {connection.scopes.join(", ") || t("connections.noScope")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("connections.statusLabel")}{" "}
                  {connection.isActive
                    ? t("connections.statusActive")
                    : t("connections.statusRevoked")}
                </p>
              </div>
              {connection.isActive ? (
                <Button
                  variant="destructive"
                  onClick={() => void handleRevokeConnection(connection.id)}
                >
                  {t("connections.revokeButton")}
                </Button>
              ) : null}
            </div>
          ))}
          {!connections.length && !isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t("connections.empty")}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
