import { apiRequest } from "@/lib/api-client";

export type PartnerParserMode =
  | "generic"
  | "mangalivre"
  | "seriesSlugNumberPath"
  | "singleSlugNumberPath";

export type ConnectablePartner = {
  id: string;
  slug: string;
  name: string;
  allowedDomains: string[];
  parserMode: PartnerParserMode | null;
  parserTitleSelectors: string[];
  parserChapterSelectors: string[];
};

export type IntegrationConnection = {
  id: string;
  isActive: boolean;
  scopes: string[];
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    username: string;
  };
  partner: {
    id: string;
    slug: string;
    name: string;
  };
};

export type IntegrationConnectionStatus = {
  connected: boolean;
  partner: {
    id: string;
    slug: string;
  };
  checks: {
    partnerExists: boolean;
    partnerActive: boolean;
    connectionExists: boolean;
    connectionActive: boolean;
    tokenHasWriteScope: boolean;
    connectionHasWriteScope: boolean;
  };
  scopes: string[];
  tokenExpiresAt: string | null;
  connectionId: string | null;
  connectionUpdatedAt: string | null;
};

export type IntegrationApplicationStatus = "PENDING" | "APPROVED" | "REJECTED";
export type DomainVerificationStatus = "PENDING" | "VERIFIED" | "FAILED";

export type IntegrationApplication = {
  id: string;
  requestedSlug: string;
  name: string;
  contactEmail: string;
  siteUrl: string;
  allowedDomains: string[];
  useCase: string | null;
  verificationDomain: string | null;
  domainVerificationStatus: DomainVerificationStatus;
  domainVerificationError: string | null;
  domainVerificationLastCheckedAt: string | null;
  domainVerifiedAt: string | null;
  status: IntegrationApplicationStatus;
  reviewReason: string | null;
  approvedPartnerId: string | null;
  reviewedByEmail: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicApplicationNextAction =
  | "VERIFY_DOMAIN"
  | "WAIT_APPROVAL"
  | "CHECK_EMAIL_FOR_CREDENTIALS"
  | "CHECK_REVIEW_REASON_OR_CONTACT_SUPPORT";

export type PublicIntegrationApplicationStatus = {
  id: string;
  requestedSlug: string;
  verificationDomain: string | null;
  domainVerificationDnsRecordName: string | null;
  domainVerificationToken: string | null;
  domainVerificationStatus: DomainVerificationStatus;
  domainVerificationError: string | null;
  domainVerificationLastCheckedAt: string | null;
  domainVerifiedAt: string | null;
  status: IntegrationApplicationStatus;
  reviewReason: string | null;
  nextAction: PublicApplicationNextAction;
  createdAt: string;
  reviewedAt: string | null;
  updatedAt: string;
};

export type AdminPartner = {
  id: string;
  slug: string;
  name: string;
  allowedDomains: string[];
  parserMode: PartnerParserMode | null;
  parserTitleSelectors: string[];
  parserChapterSelectors: string[];
  isActive: boolean;
  secretRotation: {
    previousSecretExpiresAt: string | null;
    previousSecretActive: boolean;
    lastPreviousSecretUsedAt: string | null;
  };
  createdAt: string;
  updatedAt: string;
};

export type AdminPartnerWithSecret = AdminPartner & {
  clientSecret: string;
};

export type AdminPartnerWebhook = {
  id: string;
  url: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deliveryStats: {
    delivered: number;
    retry: number;
    dlq: number;
  };
  lastDelivery: {
    eventId: string;
    status: "DELIVERED" | "RETRY" | "DLQ";
    attempt: number;
    responseStatus: number | null;
    errorMessage: string | null;
    deliveredAt: string | null;
    nextRetryAt: string | null;
    createdAt: string;
  } | null;
};

export async function listConnectablePartners() {
  return apiRequest<ConnectablePartner[]>("/integrations/partners");
}

export async function createPublicIntegrationApplication(input: {
  requestedSlug: string;
  name: string;
  contactEmail: string;
  siteUrl: string;
  allowedDomains?: string[];
  useCase?: string;
  captchaToken?: string;
  website?: string;
}) {
  return apiRequest<{
    id: string;
    requestedSlug: string;
    name: string;
    contactEmail: string;
    siteUrl: string;
    allowedDomains: string[];
    useCase: string | null;
    verificationDomain: string | null;
    domainVerificationDnsRecordName: string | null;
    domainVerificationToken: string | null;
    domainVerificationStatus: DomainVerificationStatus;
    status: IntegrationApplicationStatus;
    createdAt: string;
  }>("/integrations/public/apply", {
    method: "POST",
    body: input,
  });
}

export async function getPublicIntegrationApplicationStatus(applicationId: string) {
  return apiRequest<PublicIntegrationApplicationStatus>(
    `/integrations/public/apply/${encodeURIComponent(applicationId)}/status`,
  );
}

export async function verifyPublicIntegrationApplicationDomain(
  applicationId: string,
) {
  return apiRequest<{
    id: string;
    verificationDomain: string | null;
    domainVerificationDnsRecordName: string | null;
    domainVerificationToken: string | null;
    domainVerificationStatus: DomainVerificationStatus;
    domainVerificationError: string | null;
    domainVerificationLastCheckedAt: string | null;
    domainVerifiedAt: string | null;
  }>(`/integrations/public/apply/${encodeURIComponent(applicationId)}/verify-domain`, {
    method: "POST",
  });
}

export async function startIntegrationConnect(input: {
  partnerSlug: string;
  sourceDomain?: string;
  scopes?: string[];
}) {
  return apiRequest<{ code: string; expiresInMs: number }>(
    "/integrations/connect/start",
    {
      method: "POST",
      csrf: "authenticated-required",
      body: input,
    },
  );
}

export async function getIntegrationConnectionStatus(accessToken: string) {
  return apiRequest<IntegrationConnectionStatus>("/integrations/connection/status", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function listAdminPartners() {
  return apiRequest<AdminPartner[]>("/integrations/admin/partners");
}

export async function createAdminPartner(input: {
  slug: string;
  name: string;
  allowedDomains?: string[];
  parserMode?: PartnerParserMode;
  parserTitleSelectors?: string[];
  parserChapterSelectors?: string[];
  isActive?: boolean;
  clientSecret?: string;
}) {
  return apiRequest<AdminPartnerWithSecret>("/integrations/admin/partners", {
    method: "POST",
    csrf: "authenticated-required",
    body: input,
  });
}

export async function updateAdminPartner(
  id: string,
  input: {
    name?: string;
    allowedDomains?: string[];
    parserMode?: PartnerParserMode;
    parserTitleSelectors?: string[];
    parserChapterSelectors?: string[];
    isActive?: boolean;
  },
) {
  return apiRequest<AdminPartner>(`/integrations/admin/partners/${id}`, {
    method: "PATCH",
    csrf: "authenticated-required",
    body: input,
  });
}

export async function rotateAdminPartnerSecret(
  id: string,
  input: { clientSecret?: string; transitionWindowHours?: number } = {},
) {
  return apiRequest<{
    id: string;
    clientSecret: string;
    previousSecretExpiresAt: string;
    transitionWindowHours: number;
  }>(
    `/integrations/admin/partners/${id}/rotate-secret`,
    {
      method: "POST",
      csrf: "authenticated-required",
      body: input,
    },
  );
}

export async function listAdminPartnerWebhooks(partnerId: string) {
  return apiRequest<{
    partner: { id: string; slug: string; name: string };
    endpoints: AdminPartnerWebhook[];
  }>(`/integrations/admin/partners/${encodeURIComponent(partnerId)}/webhooks`);
}

export async function createAdminPartnerWebhook(
  partnerId: string,
  input: {
    url: string;
    isActive?: boolean;
    signingSecret?: string;
  },
) {
  return apiRequest<{
    id: string;
    partnerId: string;
    url: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    signingSecret: string;
  }>(`/integrations/admin/partners/${encodeURIComponent(partnerId)}/webhooks`, {
    method: "POST",
    csrf: "authenticated-required",
    body: input,
  });
}

export async function listAdminConnections(partnerSlug?: string) {
  const suffix = partnerSlug
    ? `?partnerSlug=${encodeURIComponent(partnerSlug)}`
    : "";
  return apiRequest<IntegrationConnection[]>(
    `/integrations/admin/connections${suffix}`,
  );
}

export async function revokeAdminConnection(connectionId: string) {
  return apiRequest<{ id: string; isActive: boolean; updatedAt: string }>(
    `/integrations/admin/connections/${connectionId}/revoke`,
    {
      method: "POST",
      csrf: "authenticated-required",
    },
  );
}

export async function listAdminApplications(
  status?: IntegrationApplicationStatus,
) {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiRequest<IntegrationApplication[]>(
    `/integrations/admin/applications${suffix}`,
  );
}

export async function approveAdminApplication(
  id: string,
  input: {
    slug?: string;
    name?: string;
    allowedDomains?: string[];
    clientSecret?: string;
  } = {},
) {
  return apiRequest<{
    application: {
      id: string;
      requestedSlug: string;
      name: string;
      contactEmail: string;
      allowedDomains: string[];
      status: IntegrationApplicationStatus;
      approvedPartnerId: string | null;
      reviewedByEmail: string | null;
      reviewedAt: string | null;
      updatedAt: string;
    };
    partner: AdminPartnerWithSecret;
  }>(`/integrations/admin/applications/${id}/approve`, {
    method: "POST",
    csrf: "authenticated-required",
    body: input,
  });
}

export async function rejectAdminApplication(
  id: string,
  input: { reason?: string } = {},
) {
  return apiRequest<{
    id: string;
    status: IntegrationApplicationStatus;
    reviewReason: string | null;
    reviewedByEmail: string | null;
    reviewedAt: string | null;
    updatedAt: string;
  }>(`/integrations/admin/applications/${id}/reject`, {
    method: "POST",
    csrf: "authenticated-required",
    body: input,
  });
}
