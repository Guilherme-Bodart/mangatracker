"use client";

import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  AdminPartner,
  IntegrationApplication,
  IntegrationApplicationStatus,
  IntegrationConnection,
  IntegrationConnectionStatus,
} from "@/lib/integrations-api";
import type {
  IntegrationsAdminCreateFormState,
  IntegrationStatusCheckLabel,
} from "@/hooks/use-integrations-admin-page";

type TranslatorFn = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

function getSecretRotation(partner: AdminPartner) {
  return partner.secretRotation ?? {
    previousSecretExpiresAt: null,
    previousSecretActive: false,
    lastPreviousSecretUsedAt: null,
  };
}

type CreatePartnerCardProps = {
  t: TranslatorFn;
  createForm: IntegrationsAdminCreateFormState;
  setCreateForm: Dispatch<SetStateAction<IntegrationsAdminCreateFormState>>;
  onSubmit: (event: React.FormEvent) => Promise<void>;
};

export function CreatePartnerCard({
  t,
  createForm,
  setCreateForm,
  onSubmit,
}: CreatePartnerCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("createCard.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
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
  );
}

type NewSecretCardProps = {
  t: TranslatorFn;
  newSecret: string | null;
  newSecretRotationInfo: {
    previousSecretExpiresAt: string;
    transitionWindowHours: number;
  } | null;
};

export function NewSecretCard({
  t,
  newSecret,
  newSecretRotationInfo,
}: NewSecretCardProps) {
  if (!newSecret) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("secretCard.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted px-3 py-2 font-mono text-sm break-all">
          {newSecret}
        </div>
        <p className="text-sm text-muted-foreground">{t("secretCard.description")}</p>
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
  );
}

type ConnectionStatusCardProps = {
  t: TranslatorFn;
  statusToken: string;
  setStatusToken: (value: string) => void;
  statusResult: IntegrationConnectionStatus | null;
  setStatusResult: (value: IntegrationConnectionStatus | null) => void;
  statusCheckLabels: IntegrationStatusCheckLabel[];
  isCheckingStatus: boolean;
  onCheckStatus: () => Promise<void>;
};

export function ConnectionStatusCard({
  t,
  statusToken,
  setStatusToken,
  statusResult,
  setStatusResult,
  statusCheckLabels,
  isCheckingStatus,
  onCheckStatus,
}: ConnectionStatusCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("connectionStatus.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("connectionStatus.description")}</p>
        <div className="space-y-2">
          <Label>{t("connectionStatus.tokenLabel")}</Label>
          <Input
            value={statusToken}
            onChange={(event) => setStatusToken(event.target.value)}
            placeholder={t("connectionStatus.tokenPlaceholder")}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void onCheckStatus()} disabled={isCheckingStatus}>
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
              {statusResult.connectionUpdatedAt ?? t("connectionStatus.notAvailable")}
            </p>
            <div className="pt-2 space-y-1">
              <p className="font-medium">{t("connectionStatus.checksTitle")}</p>
              {statusCheckLabels.map((item) => {
                const value = statusResult.checks[item.key];
                return (
                  <p key={item.key} className="text-muted-foreground">
                    {item.label}:{" "}
                    {value ? t("connectionStatus.checkOk") : t("connectionStatus.checkFail")}
                  </p>
                );
              })}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

type PartnersCardProps = {
  t: TranslatorFn;
  partners: AdminPartner[];
  isLoading: boolean;
  formatDateTime: (value: string | null) => string;
  onTogglePartner: (partner: AdminPartner) => Promise<void>;
  onRotateSecret: (partner: AdminPartner) => Promise<void>;
};

export function PartnersCard({
  t,
  partners,
  isLoading,
  formatDateTime,
  onTogglePartner,
  onRotateSecret,
}: PartnersCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("partners.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {partners.map((partner) => {
          const rotation = getSecretRotation(partner);
          return (
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
                  {partner.isActive ? t("partners.statusActive") : t("partners.statusInactive")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("partners.previousSecretWindowLabel")}{" "}
                  {rotation.previousSecretActive
                    ? t("partners.previousSecretWindowActive")
                    : t("partners.previousSecretWindowInactive")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("partners.previousSecretExpiresAtLabel")}{" "}
                  {formatDateTime(rotation.previousSecretExpiresAt)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("partners.lastPreviousSecretUsedAtLabel")}{" "}
                  {formatDateTime(rotation.lastPreviousSecretUsedAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => void onTogglePartner(partner)}>
                  {partner.isActive ? t("partners.deactivateButton") : t("partners.activateButton")}
                </Button>
                <Button variant="outline" onClick={() => void onRotateSecret(partner)}>
                  {t("partners.rotateSecretButton")}
                </Button>
              </div>
            </div>
          );
        })}
        {!partners.length && !isLoading ? (
          <p className="text-sm text-muted-foreground">{t("partners.empty")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

type ApplicationsCardProps = {
  t: TranslatorFn;
  applications: IntegrationApplication[];
  isLoading: boolean;
  applicationStatusFilter: "" | IntegrationApplicationStatus;
  setApplicationStatusFilter: (value: "" | IntegrationApplicationStatus) => void;
  connectionFilter: string;
  onLoadData: (
    partnerSlug?: string,
    applicationStatus?: "" | IntegrationApplicationStatus,
  ) => Promise<void>;
  onVerifyDomain: (application: IntegrationApplication) => Promise<void>;
  onApprove: (application: IntegrationApplication) => Promise<void>;
  onReject: (application: IntegrationApplication) => Promise<void>;
};

export function ApplicationsCard({
  t,
  applications,
  isLoading,
  applicationStatusFilter,
  setApplicationStatusFilter,
  connectionFilter,
  onLoadData,
  onVerifyDomain,
  onApprove,
  onReject,
}: ApplicationsCardProps) {
  return (
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
                void onLoadData(connectionFilter || undefined, nextValue || undefined);
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {applications.map((application) => (
          <div key={application.id} className="rounded-md border p-3 flex flex-col gap-3">
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
                <Button variant="outline" onClick={() => void onVerifyDomain(application)}>
                  {t("applications.verifyDomainButton")}
                </Button>
                <Button onClick={() => void onApprove(application)}>
                  {t("applications.approveButton")}
                </Button>
                <Button variant="destructive" onClick={() => void onReject(application)}>
                  {t("applications.rejectButton")}
                </Button>
              </div>
            ) : null}
          </div>
        ))}

        {!applications.length && !isLoading ? (
          <p className="text-sm text-muted-foreground">{t("applications.empty")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

type ConnectionsCardProps = {
  t: TranslatorFn;
  connectionFilter: string;
  setConnectionFilter: (value: string) => void;
  partnerOptions: Array<{ slug: string; label: string }>;
  connections: IntegrationConnection[];
  isLoading: boolean;
  onLoadData: (
    partnerSlug?: string,
    applicationStatus?: "" | IntegrationApplicationStatus,
  ) => Promise<void>;
  onRevokeConnection: (connectionId: string) => Promise<void>;
};

export function ConnectionsCard({
  t,
  connectionFilter,
  setConnectionFilter,
  partnerOptions,
  connections,
  isLoading,
  onLoadData,
  onRevokeConnection,
}: ConnectionsCardProps) {
  return (
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
          <Button onClick={() => void onLoadData(connectionFilter || undefined)}>
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
                void onLoadData(option.slug || undefined);
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
                {t("connections.partnerLabel")} {connection.partner.name} ({connection.partner.slug}
                )
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
              <Button variant="destructive" onClick={() => void onRevokeConnection(connection.id)}>
                {t("connections.revokeButton")}
              </Button>
            ) : null}
          </div>
        ))}

        {!connections.length && !isLoading ? (
          <p className="text-sm text-muted-foreground">{t("connections.empty")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
