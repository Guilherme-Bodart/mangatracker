"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api-client";
import { useTranslations } from "next-intl";
import {
  createAdminPartner,
  listAdminConnections,
  listAdminPartners,
  revokeAdminConnection,
  rotateAdminPartnerSecret,
  updateAdminPartner,
  type AdminPartner,
  type IntegrationConnection,
} from "@/lib/integrations-api";

export default function IntegrationsAdminPage() {
  const t = useTranslations("ProfileIntegrationsAdmin");
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [partners, setPartners] = useState<AdminPartner[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    slug: "",
    name: "",
    allowedDomains: "",
    isActive: true,
  });
  const [connectionFilter, setConnectionFilter] = useState("");

  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/auth/login");
    }
  }, [isAuthLoading, user, router]);

  const loadData = async (partnerSlug?: string) => {
    setIsLoading(true);
    try {
      const [partnersData, connectionsData] = await Promise.all([
        listAdminPartners(),
        listAdminConnections(partnerSlug),
      ]);
      setPartners(partnersData);
      setConnections(connectionsData);
    } catch (error: unknown) {
      toast.error(
        getApiErrorMessage(
          error,
          t("messages.loadDataError"),
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void loadData();
  }, [user]);

  const partnerOptions = useMemo(
    () => [{ slug: "", label: t("connections.allPartners") }].concat(
      partners.map((partner) => ({
        slug: partner.slug,
        label: `${partner.name} (${partner.slug})`,
      })),
    ),
    [partners, t],
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
      toast.success(t("messages.partnerCreatedSuccess"));
      setCreateForm({ slug: "", name: "", allowedDomains: "", isActive: true });
      await loadData(connectionFilter || undefined);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t("messages.createPartnerError")));
    }
  };

  const handleTogglePartner = async (partner: AdminPartner) => {
    try {
      await updateAdminPartner(partner.id, { isActive: !partner.isActive });
      toast.success(t("messages.partnerStatusUpdatedSuccess"));
      await loadData(connectionFilter || undefined);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t("messages.updatePartnerError")));
    }
  };

  const handleRotateSecret = async (partner: AdminPartner) => {
    try {
      const rotated = await rotateAdminPartnerSecret(partner.id);
      setNewSecret(rotated.clientSecret);
      toast.success(t("messages.secretRotatedSuccess", { slug: partner.slug }));
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t("messages.rotateSecretError")));
    }
  };

  const handleRevokeConnection = async (connectionId: string) => {
    try {
      await revokeAdminConnection(connectionId);
      toast.success(t("messages.connectionRevokedSuccess"));
      await loadData(connectionFilter || undefined);
    } catch (error: unknown) {
      toast.error(
        getApiErrorMessage(error, t("messages.revokeConnectionError")),
      );
    }
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
          </CardContent>
        </Card>
      ) : null}

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
