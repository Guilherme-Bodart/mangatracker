import { apiRequest } from "@/lib/api-client";

export type ConnectablePartner = {
  id: string;
  slug: string;
  name: string;
  allowedDomains: string[];
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

export type IntegrationApplicationStatus = "PENDING" | "APPROVED" | "REJECTED";

export type IntegrationApplication = {
  id: string;
  requestedSlug: string;
  name: string;
  contactEmail: string;
  siteUrl: string;
  allowedDomains: string[];
  useCase: string | null;
  status: IntegrationApplicationStatus;
  reviewReason: string | null;
  approvedPartnerId: string | null;
  reviewedByEmail: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminPartner = {
  id: string;
  slug: string;
  name: string;
  allowedDomains: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminPartnerWithSecret = AdminPartner & {
  clientSecret: string;
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
}) {
  return apiRequest<{
    id: string;
    requestedSlug: string;
    name: string;
    contactEmail: string;
    siteUrl: string;
    allowedDomains: string[];
    useCase: string | null;
    status: IntegrationApplicationStatus;
    createdAt: string;
  }>("/integrations/public/apply", {
    method: "POST",
    body: input,
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

export async function listAdminPartners() {
  return apiRequest<AdminPartner[]>("/integrations/admin/partners");
}

export async function createAdminPartner(input: {
  slug: string;
  name: string;
  allowedDomains?: string[];
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
  input: { clientSecret?: string } = {},
) {
  return apiRequest<{ id: string; clientSecret: string }>(
    `/integrations/admin/partners/${id}/rotate-secret`,
    {
      method: "POST",
      csrf: "authenticated-required",
      body: input,
    },
  );
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
