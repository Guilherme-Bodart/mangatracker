"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "@/i18n/routing";
import { toast } from "sonner";
import { ApiClientError, getApiErrorMessage } from "@/lib/api-client";
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
  type IntegrationConnection,
  type IntegrationConnectionStatus,
} from "@/lib/integrations-api";

type TranslatorFn = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

type AuthUserLike = {
  id: string;
  email: string;
  username: string;
} | null;

export type IntegrationsAdminCreateFormState = {
  slug: string;
  name: string;
  allowedDomains: string;
  isActive: boolean;
};

export type IntegrationStatusCheckLabel = {
  key: keyof IntegrationConnectionStatus["checks"];
  label: string;
};

type UseIntegrationsAdminPageParams = {
  user: AuthUserLike;
  isAuthLoading: boolean;
  t: TranslatorFn;
};

export function useIntegrationsAdminPage({
  user,
  isAuthLoading,
  t,
}: UseIntegrationsAdminPageParams) {
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
  const [createForm, setCreateForm] = useState<IntegrationsAdminCreateFormState>({
    slug: "",
    name: "",
    allowedDomains: "",
    isActive: true,
  });
  const [connectionFilter, setConnectionFilter] = useState("");
  const [applicationStatusFilter, setApplicationStatusFilter] = useState<
    "" | IntegrationApplicationStatus
  >("PENDING");

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
    () =>
      [{ slug: "", label: t("connections.allPartners") }].concat(
        partners.map((partner) => ({
          slug: partner.slug,
          label: `${partner.name} (${partner.slug})`,
        })),
      ),
    [partners, t],
  );

  const statusCheckLabels = useMemo<IntegrationStatusCheckLabel[]>(
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

  const refreshCurrentFilters = useCallback(async () => {
    await loadData(
      connectionFilter || undefined,
      applicationStatusFilter || undefined,
    );
  }, [applicationStatusFilter, connectionFilter, loadData]);

  const handleCreatePartner = useCallback(
    async (event: React.FormEvent) => {
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
        await refreshCurrentFilters();
      } catch (error: unknown) {
        handleApiError(error, t("messages.createPartnerError"));
      }
    },
    [createForm, handleApiError, refreshCurrentFilters, t],
  );

  const handleTogglePartner = useCallback(
    async (partner: AdminPartner) => {
      try {
        await updateAdminPartner(partner.id, { isActive: !partner.isActive });
        toast.success(t("messages.partnerStatusUpdatedSuccess"));
        await refreshCurrentFilters();
      } catch (error: unknown) {
        handleApiError(error, t("messages.updatePartnerError"));
      }
    },
    [handleApiError, refreshCurrentFilters, t],
  );

  const handleRotateSecret = useCallback(
    async (partner: AdminPartner) => {
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
    },
    [handleApiError, t],
  );

  const handleRevokeConnection = useCallback(
    async (connectionId: string) => {
      try {
        await revokeAdminConnection(connectionId);
        toast.success(t("messages.connectionRevokedSuccess"));
        await refreshCurrentFilters();
      } catch (error: unknown) {
        handleApiError(error, t("messages.revokeConnectionError"));
      }
    },
    [handleApiError, refreshCurrentFilters, t],
  );

  const handleApproveApplication = useCallback(
    async (application: IntegrationApplication) => {
      try {
        const approved = await approveAdminApplication(application.id, {
          slug: application.requestedSlug,
          name: application.name,
          allowedDomains: application.allowedDomains,
        });
        setNewSecret(approved.partner.clientSecret);
        setNewSecretRotationInfo(null);
        toast.success(
          t("messages.applicationApprovedSuccess", {
            slug: application.requestedSlug,
          }),
        );
        await refreshCurrentFilters();
      } catch (error: unknown) {
        handleApiError(error, t("messages.approveApplicationError"));
      }
    },
    [handleApiError, refreshCurrentFilters, t],
  );

  const handleRejectApplication = useCallback(
    async (application: IntegrationApplication) => {
      try {
        const reason =
          window.prompt(
            t("applications.rejectPrompt"),
            application.reviewReason ?? "",
          ) ?? "";
        await rejectAdminApplication(application.id, {
          reason: reason.trim() || undefined,
        });
        toast.success(
          t("messages.applicationRejectedSuccess", {
            slug: application.requestedSlug,
          }),
        );
        await refreshCurrentFilters();
      } catch (error: unknown) {
        handleApiError(error, t("messages.rejectApplicationError"));
      }
    },
    [handleApiError, refreshCurrentFilters, t],
  );

  const handleVerifyApplicationDomain = useCallback(
    async (application: IntegrationApplication) => {
      try {
        await verifyPublicIntegrationApplicationDomain(application.id);
        toast.success(t("messages.applicationDomainVerifiedSuccess"));
        await refreshCurrentFilters();
      } catch (error: unknown) {
        handleApiError(error, t("messages.applicationDomainVerifyError"));
      }
    },
    [handleApiError, refreshCurrentFilters, t],
  );

  const handleCheckConnectionStatus = useCallback(async () => {
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
  }, [handleApiError, statusToken, t]);

  const formatDateTime = useCallback(
    (value: string | null) => {
      if (!value) return t("partners.notAvailable");
      return new Date(value).toLocaleString();
    },
    [t],
  );

  return {
    isLoading,
    partners,
    connections,
    applications,
    newSecret,
    newSecretRotationInfo,
    statusToken,
    statusResult,
    isCheckingStatus,
    createForm,
    connectionFilter,
    applicationStatusFilter,
    partnerOptions,
    statusCheckLabels,
    setStatusToken,
    setStatusResult,
    setCreateForm,
    setConnectionFilter,
    setApplicationStatusFilter,
    loadData,
    handleCreatePartner,
    handleTogglePartner,
    handleRotateSecret,
    handleRevokeConnection,
    handleApproveApplication,
    handleRejectApplication,
    handleVerifyApplicationDomain,
    handleCheckConnectionStatus,
    formatDateTime,
  };
}
