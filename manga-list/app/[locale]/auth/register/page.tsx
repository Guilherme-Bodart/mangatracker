import { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";
import { getTranslations } from "next-intl/server";
import { AuthRedirect } from "@/components/auth/auth-redirect";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.register");
  return {
    title: `${t("title")} | Manga Tracker`,
    description: t("subtitle"),
  };
}

export default function RegisterPage() {
  return (
    <>
      <AuthRedirect />
      <div className="container relative h-full flex items-center justify-center">
        <div className="flex w-full flex-col items-center gap-6 py-8">
          <img
            src="/logos/logo-full-light.svg"
            alt="Manga Tracker"
            className="h-20 w-auto dark:hidden"
          />
          <img
            src="/logos/logo-full-dark.svg"
            alt="Manga Tracker"
            className="hidden h-20 w-auto dark:block"
          />
          <RegisterForm />
        </div>
      </div>
    </>
  );
}

