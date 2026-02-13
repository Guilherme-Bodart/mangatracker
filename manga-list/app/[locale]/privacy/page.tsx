type Params = Promise<{ locale: string }>;

const content = {
  en: {
    title: "Privacy Policy",
    updatedAt: "Last updated: February 12, 2026",
    intro:
      "This Privacy Policy explains what data Manga Tracker processes, why we process it, and which controls you have over your information.",
    sections: [
      {
        title: "1. Data we collect",
        body: "We collect account data (username, email, auth provider), profile data (avatar, banner, preferences), and usage data needed to operate your manga tracking lists.",
      },
      {
        title: "2. How we use data",
        body: "We use your data to authenticate your account, provide core features, maintain security, prevent abuse, and improve service reliability.",
      },
      {
        title: "3. Cookies and authentication",
        body: "Manga Tracker uses cookies for session authentication and security controls (including CSRF protection). These cookies are required for login and account actions.",
      },
      {
        title: "4. Password reset and email",
        body: "When you request password reset, we generate a temporary token and send a reset link to your email address.",
      },
      {
        title: "5. Data retention",
        body: "Account and list data are retained while your account is active. Security and operational logs are retained for a limited period needed for abuse prevention and troubleshooting.",
      },
      {
        title: "6. Third-party services",
        body: "Manga metadata is retrieved from external APIs (such as Jikan and MangaDex). OAuth login may use Google. Their own policies apply to those services.",
      },
      {
        title: "7. Your rights",
        body: "You may request account data export, correction, or deletion, subject to legal and security requirements.",
      },
      {
        title: "8. Policy updates",
        body: "We may update this policy. Material changes will be reflected by a new effective date on this page.",
      },
    ],
    contactLabel: "Privacy contact",
    contactText:
      "For privacy or data deletion requests, contact: contact.manga.tracker@gmail.com",
  },
  pt: {
    title: "Pol\u00edtica de Privacidade",
    updatedAt: "\u00daltima atualiza\u00e7\u00e3o: 12 de fevereiro de 2026",
    intro:
      "Esta Pol\u00edtica de Privacidade explica quais dados o Manga Tracker processa, por que processa e quais controles voc\u00ea tem sobre suas informa\u00e7\u00f5es.",
    sections: [
      {
        title: "1. Dados coletados",
        body: "Coletamos dados de conta (username, email, provedor de login), dados de perfil (avatar, banner, prefer\u00eancias) e dados de uso necess\u00e1rios para operar suas listas de mang\u00e1.",
      },
      {
        title: "2. Uso dos dados",
        body: "Usamos seus dados para autenticar conta, fornecer funcionalidades principais, manter seguran\u00e7a, prevenir abuso e melhorar a confiabilidade do servi\u00e7o.",
      },
      {
        title: "3. Cookies e autentica\u00e7\u00e3o",
        body: "O Manga Tracker usa cookies para autentica\u00e7\u00e3o de sess\u00e3o e controles de seguran\u00e7a (incluindo prote\u00e7\u00e3o CSRF). Esses cookies s\u00e3o necess\u00e1rios para login e a\u00e7\u00f5es de conta.",
      },
      {
        title: "4. Redefini\u00e7\u00e3o de senha e e-mail",
        body: "Quando voc\u00ea solicita redefini\u00e7\u00e3o de senha, geramos um token tempor\u00e1rio e enviamos um link de redefini\u00e7\u00e3o para seu e-mail.",
      },
      {
        title: "5. Reten\u00e7\u00e3o de dados",
        body: "Dados de conta e lista s\u00e3o mantidos enquanto sua conta estiver ativa. Logs de seguran\u00e7a e opera\u00e7\u00e3o s\u00e3o retidos por per\u00edodo limitado para preven\u00e7\u00e3o de abuso e diagn\u00f3stico.",
      },
      {
        title: "6. Servi\u00e7os de terceiros",
        body: "Metadados de mang\u00e1 s\u00e3o obtidos de APIs externas (como Jikan e MangaDex). Login OAuth pode usar Google. As pol\u00edticas desses servi\u00e7os tamb\u00e9m se aplicam.",
      },
      {
        title: "7. Seus direitos",
        body: "Voc\u00ea pode solicitar exporta\u00e7\u00e3o, corre\u00e7\u00e3o ou exclus\u00e3o dos dados da conta, sujeito a requisitos legais e de seguran\u00e7a.",
      },
      {
        title: "8. Atualiza\u00e7\u00f5es da pol\u00edtica",
        body: "Podemos atualizar esta pol\u00edtica. Mudan\u00e7as relevantes ser\u00e3o refletidas por nova data de vig\u00eancia nesta p\u00e1gina.",
      },
    ],
    contactLabel: "Contato de privacidade",
    contactText:
      "Para solicita\u00e7\u00f5es de privacidade ou exclus\u00e3o de dados, contate: contact.manga.tracker@gmail.com",
  },
} as const;

export default async function PrivacyPage({ params }: { params: Params }) {
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
