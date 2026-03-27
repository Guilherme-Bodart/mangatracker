"use client";

import { useAuth } from "@/contexts/auth-context";
import { useTranslations } from "next-intl";
import { useIntegrationsAdminPage } from "@/hooks/use-integrations-admin-page";
import {
  ApplicationsCard,
  ConnectionsCard,
  ConnectionStatusCard,
  CreatePartnerCard,
  NewSecretCard,
  PartnersCard,
} from "@/components/profile/integrations-admin/integrations-admin-sections";

export default function IntegrationsAdminPage() {
  const t = useTranslations("ProfileIntegrationsAdmin");
  const { user, isLoading: isAuthLoading } = useAuth();
  const {
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
  } = useIntegrationsAdminPage({
    user,
    isAuthLoading,
    t,
  });

  if (isAuthLoading || !user) {
    return null;
  }

  return (
    <div className="container mx-auto max-w-5xl py-8 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">{t("subtitle")}</p>
      </div>

      <CreatePartnerCard
        t={t}
        createForm={createForm}
        setCreateForm={setCreateForm}
        onSubmit={handleCreatePartner}
      />

      <NewSecretCard
        t={t}
        newSecret={newSecret}
        newSecretRotationInfo={newSecretRotationInfo}
      />

      <ConnectionStatusCard
        t={t}
        statusToken={statusToken}
        setStatusToken={setStatusToken}
        statusResult={statusResult}
        setStatusResult={setStatusResult}
        statusCheckLabels={statusCheckLabels}
        isCheckingStatus={isCheckingStatus}
        onCheckStatus={handleCheckConnectionStatus}
      />

      <PartnersCard
        t={t}
        partners={partners}
        isLoading={isLoading}
        formatDateTime={formatDateTime}
        onTogglePartner={handleTogglePartner}
        onRotateSecret={handleRotateSecret}
      />

      <ApplicationsCard
        t={t}
        applications={applications}
        isLoading={isLoading}
        applicationStatusFilter={applicationStatusFilter}
        setApplicationStatusFilter={setApplicationStatusFilter}
        connectionFilter={connectionFilter}
        onLoadData={loadData}
        onVerifyDomain={handleVerifyApplicationDomain}
        onApprove={handleApproveApplication}
        onReject={handleRejectApplication}
      />

      <ConnectionsCard
        t={t}
        connectionFilter={connectionFilter}
        setConnectionFilter={setConnectionFilter}
        partnerOptions={partnerOptions}
        connections={connections}
        isLoading={isLoading}
        onLoadData={loadData}
        onRevokeConnection={handleRevokeConnection}
      />
    </div>
  );
}
