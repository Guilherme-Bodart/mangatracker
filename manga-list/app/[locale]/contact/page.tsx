type Params = Promise<{ locale: string }>;

const content = {
  en: {
    title: "Contact",
    updatedAt: "Last updated: February 12, 2026",
    intro:
      "Need help, found a bug, or want to send feedback? Reach us through the channels below.",
    sections: [
      {
        title: "General support",
        body: "For account, login, or platform usage questions, email us and include as much context as possible.",
      },
      {
        title: "Security reports",
        body: "If you found a potential security issue, report it privately with reproduction steps so we can investigate quickly.",
      },
      {
        title: "Legal and privacy",
        body: "For legal, terms, or privacy requests, use the same contact address with a clear subject line.",
      },
    ],
    emailLabel: "Contact email",
    emailValue: "contact.manga.tracker@gmail.com",
  },
  pt: {
    title: "Contato",
    updatedAt: "\u00daltima atualiza\u00e7\u00e3o: 12 de fevereiro de 2026",
    intro:
      "Precisa de ajuda, encontrou um bug ou quer enviar feedback? Fale com a gente pelos canais abaixo.",
    sections: [
      {
        title: "Suporte geral",
        body: "Para d\u00favidas sobre conta, login ou uso da plataforma, envie e-mail com o m\u00e1ximo de contexto poss\u00edvel.",
      },
      {
        title: "Relatos de seguran\u00e7a",
        body: "Se voc\u00ea encontrou uma poss\u00edvel falha de seguran\u00e7a, reporte em particular com passos de reprodu\u00e7\u00e3o para investigarmos rapidamente.",
      },
      {
        title: "Jur\u00eddico e privacidade",
        body: "Para solicita\u00e7\u00f5es legais, de termos ou de privacidade, use o mesmo e-mail de contato com assunto claro.",
      },
    ],
    emailLabel: "E-mail de contato",
    emailValue: "contact.manga.tracker@gmail.com",
  },
} as const;

export default async function ContactPage({ params }: { params: Params }) {
  const { locale } = await params;
  const lang = locale === "pt" ? "pt" : "en";
  const t = content[lang];

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.updatedAt}</p>
        <p className="text-muted-foreground">{t.intro}</p>
      </header>

      <section className="space-y-6">
        {t.sections.map((section) => (
          <article key={section.title} className="space-y-2">
            <h2 className="text-xl font-semibold">{section.title}</h2>
            <p className="text-muted-foreground leading-relaxed">{section.body}</p>
          </article>
        ))}
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="font-semibold mb-2">{t.emailLabel}</h2>
        <p className="text-sm text-muted-foreground">{t.emailValue}</p>
      </section>
    </div>
  );
}
