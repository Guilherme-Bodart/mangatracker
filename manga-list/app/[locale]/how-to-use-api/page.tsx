import { getApiBaseUrl } from "@/lib/api-client";
import { getTranslations } from "next-intl/server";

type Params = Promise<{ locale: string }>;

type StepKey =
  | "application"
  | "applicationStatus"
  | "approval"
  | "userConnectCode"
  | "exchange"
  | "sync";

const STEP_ORDER: StepKey[] = [
  "application",
  "applicationStatus",
  "approval",
  "userConnectCode",
  "exchange",
  "sync",
];

function CodeBlock({ value }: { value: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs leading-relaxed">
      <code>{value}</code>
    </pre>
  );
}

export default async function HowToUseApiPage({ params }: { params: Params }) {
  const { locale } = await params;
  const effectiveLocale: "pt" | "en" = locale === "pt" ? "pt" : "en";
  const t = await getTranslations({
    locale: effectiveLocale,
    namespace: "HowToUseApi",
  });
  const apiBaseUrl = getApiBaseUrl();

  const roles = ["partner", "user", "platform"].map((key) => ({
    title: t(`roles.${key}.title`),
    body: t(`roles.${key}.body`),
  }));

  const getRawString = (key: string): string | null => {
    if (!t.has(key)) {
      return null;
    }
    const value = t.raw(key);
    return typeof value === "string" ? value : null;
  };

  const steps = STEP_ORDER.map((key) => {
    const notes: string[] = [];
    for (let index = 1; index <= 5; index += 1) {
      const noteKey = `steps.${key}.notes.${index}`;
      if (t.has(noteKey)) {
        notes.push(t(noteKey));
      }
    }

    const endpointKey = `steps.${key}.endpoint`;
    const requestKey = `steps.${key}.request`;
    const responseKey = `steps.${key}.response`;

    return {
      key,
      title: t(`steps.${key}.title`),
      body: t(`steps.${key}.body`),
      endpoint: getRawString(endpointKey),
      request: getRawString(requestKey),
      response: getRawString(responseKey),
      notes,
    };
  });

  const securityItems = [1, 2, 3, 4, 5]
    .map((index) => {
      const key = `security.items.${index}`;
      return t.has(key) ? t(key) : null;
    })
    .filter((value): value is string => !!value);

  const limitItems = [1, 2, 3, 4, 5]
    .map((index) => {
      const key = `limits.items.${index}`;
      return t.has(key) ? t(key) : null;
    })
    .filter((value): value is string => !!value);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-12 space-y-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("updatedAt")}</p>
        <p className="text-muted-foreground leading-relaxed">{t("intro")}</p>
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">{t("baseUrlLabel")}</p>
          <p className="font-mono text-sm mt-1">{apiBaseUrl}</p>
          <p className="text-xs text-muted-foreground mt-2">{t("baseUrlNote")}</p>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">{t("rolesTitle")}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {roles.map((role) => (
            <article key={role.title} className="rounded-lg border p-4 space-y-2">
              <h3 className="font-semibold">{role.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {role.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-2xl font-semibold">{t("flowTitle")}</h2>
        {steps.map((step) => (
          <article key={step.key} className="rounded-lg border p-4 space-y-3">
            <h3 className="text-lg font-semibold">{step.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {step.body}
            </p>
            {step.endpoint ? (
              <p className="text-sm font-mono rounded-md bg-muted px-2 py-1 inline-block">
                {step.endpoint}
              </p>
            ) : null}
            {step.request ? <CodeBlock value={step.request} /> : null}
            {step.response ? <CodeBlock value={step.response} /> : null}
            {step.notes.length ? (
              <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                {step.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <article className="rounded-lg border p-4 space-y-3">
          <h2 className="text-xl font-semibold">{t("security.title")}</h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
            {securityItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="rounded-lg border p-4 space-y-3">
          <h2 className="text-xl font-semibold">{t("limits.title")}</h2>
          <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
            {limitItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}
