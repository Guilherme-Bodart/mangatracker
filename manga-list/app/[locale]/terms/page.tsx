type Params = Promise<{ locale: string }>;

const content = {
  en: {
    title: "Terms of Service",
    updatedAt: "Last updated: February 12, 2026",
    intro:
      "These Terms of Service govern your access to and use of Manga Tracker. By creating an account or using the platform, you agree to these terms.",
    sections: [
      {
        title: "1. Account and eligibility",
        body: "You are responsible for your account credentials and for all activity under your account. You must provide accurate information and keep it up to date.",
      },
      {
        title: "2. Acceptable use",
        body: "You may not use Manga Tracker for unlawful activity, abuse, harassment, spam, credential abuse, or attempts to disrupt the service.",
      },
      {
        title: "3. User content",
        body: "You keep ownership of your list data, notes, and profile content. You grant Manga Tracker a limited license to store and display this content to operate the service.",
      },
      {
        title: "4. Third-party services",
        body: "Manga metadata may come from external providers such as Jikan or MangaDex. Availability, quality, and update frequency depend on those providers.",
      },
      {
        title: "5. Service changes and availability",
        body: "Manga Tracker may change features, pause, or discontinue parts of the service at any time, including for maintenance and security.",
      },
      {
        title: "6. Termination",
        body: "We may suspend or terminate accounts that violate these terms. You may stop using the service at any time.",
      },
      {
        title: "7. Disclaimer and liability",
        body: "The service is provided on an as-is basis. To the maximum extent allowed by law, Manga Tracker is not liable for indirect, incidental, or consequential damages.",
      },
      {
        title: "8. Changes to these terms",
        body: "We may update these terms. Continued use after changes are published means you accept the updated version.",
      },
    ],
    contactLabel: "Contact",
    contactText:
      "For legal requests or terms questions, contact: contact.manga.tracker@gmail.com",
  },
  pt: {
    title: "Termos de Servi\u00e7o",
    updatedAt: "\u00daltima atualiza\u00e7\u00e3o: 12 de fevereiro de 2026",
    intro:
      "Estes Termos de Servi\u00e7o regem o acesso e uso do Manga Tracker. Ao criar conta ou usar a plataforma, voc\u00ea concorda com estes termos.",
    sections: [
      {
        title: "1. Conta e elegibilidade",
        body: "Voc\u00ea \u00e9 respons\u00e1vel pelas credenciais da sua conta e por toda atividade nela. Voc\u00ea deve fornecer informa\u00e7\u00f5es corretas e mant\u00ea-las atualizadas.",
      },
      {
        title: "2. Uso aceit\u00e1vel",
        body: "N\u00e3o \u00e9 permitido usar o Manga Tracker para atividade ilegal, abuso, ass\u00e9dio, spam, abuso de credenciais ou tentativas de interromper o servi\u00e7o.",
      },
      {
        title: "3. Conte\u00fado do usu\u00e1rio",
        body: "Voc\u00ea mant\u00e9m a propriedade dos seus dados de lista, notas e perfil. Voc\u00ea concede ao Manga Tracker uma licen\u00e7a limitada para armazenar e exibir esse conte\u00fado para operar o servi\u00e7o.",
      },
      {
        title: "4. Servi\u00e7os de terceiros",
        body: "Metadados de mang\u00e1 podem vir de provedores externos como Jikan e MangaDex. Disponibilidade, qualidade e frequ\u00eancia de atualiza\u00e7\u00e3o dependem desses provedores.",
      },
      {
        title: "5. Mudan\u00e7as e disponibilidade",
        body: "O Manga Tracker pode alterar recursos, pausar ou descontinuar partes do servi\u00e7o a qualquer momento, inclusive por manuten\u00e7\u00e3o e seguran\u00e7a.",
      },
      {
        title: "6. Encerramento",
        body: "Podemos suspender ou encerrar contas que violem estes termos. Voc\u00ea pode parar de usar o servi\u00e7o a qualquer momento.",
      },
      {
        title: "7. Isen\u00e7\u00e3o e responsabilidade",
        body: "O servi\u00e7o \u00e9 fornecido no estado em que se encontra. No limite permitido por lei, o Manga Tracker n\u00e3o se responsabiliza por danos indiretos, incidentais ou consequenciais.",
      },
      {
        title: "8. Altera\u00e7\u00f5es destes termos",
        body: "Podemos atualizar estes termos. O uso continuado ap\u00f3s publica\u00e7\u00e3o das altera\u00e7\u00f5es significa aceita\u00e7\u00e3o da vers\u00e3o atualizada.",
      },
    ],
    contactLabel: "Contato",
    contactText:
      "Para solicita\u00e7\u00f5es legais ou d\u00favidas sobre termos, contate: contact.manga.tracker@gmail.com",
  },
} as const;

export default async function TermsPage({ params }: { params: Params }) {
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
        <h2 className="font-semibold mb-2">{t.contactLabel}</h2>
        <p className="text-sm text-muted-foreground">{t.contactText}</p>
      </section>
    </div>
  );
}
