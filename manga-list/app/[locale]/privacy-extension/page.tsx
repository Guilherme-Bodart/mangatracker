type Params = Promise<{ locale: string }>;

const content = {
  en: {
    title: "Privacy Policy - Manga Tracker Sync Extension",
    updatedAt: "Last updated: February 24, 2026",
    intro:
      "This policy describes how the Manga Tracker Sync browser extension processes data to sync manga reading progress.",
    sections: [
      {
        title: "1. Data processed",
        body: "The extension may process manga title, detected chapter, external manga identifier (slug), and source domain from supported reading pages.",
      },
      {
        title: "2. Local storage",
        body: "The extension stores user-provided settings in browser extension storage: API base URL, partner slug, integration access token, and allowed domains.",
      },
      {
        title: "3. Data usage",
        body: "Processed data is used only to synchronize reading progress with the user's Manga Tracker account.",
      },
      {
        title: "4. Data transfer",
        body: "Data is sent only to the API base URL configured by the user in extension settings.",
      },
      {
        title: "5. Sharing and sale",
        body: "No personal data is sold. Data is not shared with third parties outside Manga Tracker infrastructure, except when legally required.",
      },
      {
        title: "6. User controls",
        body: "Users can disable the extension at any time, change settings, revoke integration tokens from account settings, and uninstall the extension to remove local data.",
      },
      {
        title: "7. Security",
        body: "Production API communication should use HTTPS. Integration tokens are sensitive credentials and must be kept private.",
      },
    ],
    contactLabel: "Contact",
    contactText: "Privacy requests: contact.manga.tracker@gmail.com",
  },
  pt: {
    title: "Política de Privacidade - Extensão Manga Tracker Sync",
    updatedAt: "Última atualização: 24 de fevereiro de 2026",
    intro:
      "Esta política descreve como a extensão de navegador Manga Tracker Sync processa dados para sincronizar progresso de leitura.",
    sections: [
      {
        title: "1. Dados processados",
        body: "A extensão pode processar título do mangá, capítulo detectado, identificador externo (slug) e domínio de origem em páginas de leitura suportadas.",
      },
      {
        title: "2. Armazenamento local",
        body: "A extensão armazena configurações informadas pelo usuário no armazenamento da extensão: URL base da API, slug do parceiro, token de integração e domínios permitidos.",
      },
      {
        title: "3. Uso dos dados",
        body: "Os dados processados são usados somente para sincronizar o progresso de leitura com a conta do usuário no Manga Tracker.",
      },
      {
        title: "4. Envio de dados",
        body: "Os dados são enviados apenas para a URL de API configurada pelo usuário nas opções da extensão.",
      },
      {
        title: "5. Compartilhamento e venda",
        body: "Nenhum dado pessoal é vendido. Não há compartilhamento com terceiros fora da infraestrutura do Manga Tracker, exceto quando exigido por lei.",
      },
      {
        title: "6. Controle do usuário",
        body: "O usuário pode desativar a extensão a qualquer momento, alterar configurações, revogar tokens de integração nas configurações da conta e desinstalar a extensão para remover dados locais.",
      },
      {
        title: "7. Segurança",
        body: "A comunicação com API em produção deve usar HTTPS. Tokens de integração são credenciais sensíveis e devem ser mantidos em sigilo.",
      },
    ],
    contactLabel: "Contato",
    contactText: "Solicitações de privacidade: contact.manga.tracker@gmail.com",
  },
} as const;

export default async function ExtensionPrivacyPage({ params }: { params: Params }) {
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
