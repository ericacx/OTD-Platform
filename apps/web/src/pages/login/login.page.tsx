import { BarChart3, Globe2, ShieldCheck, Workflow } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router";

import { useAuth } from "@/app/providers/auth-provider";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { useLoginMutation } from "@/features/auth/auth.mutations";
import { LoginForm, type LoginFormValues } from "@/features/auth/components/login-form";
import { config } from "@/lib/config";
import { BizError } from "@/lib/http/errors";
import { supportedLocales, type AppLocale } from "@/lib/i18n/local-backend";
import { usePreferencesStore } from "@/stores/preferences.store";

interface LoginLocationState {
  from?: {
    pathname?: string;
  };
}

const FEATURES = [
  { icon: Workflow, title: "LP_F1", desc: "LP_F1D" },
  { icon: ShieldCheck, title: "LP_F2", desc: "LP_F2D" },
  { icon: BarChart3, title: "LP_F3", desc: "LP_F3D" },
  { icon: Globe2, title: "LP_F4", desc: "LP_F4D" },
] as const;

export function LoginPage() {
  const { t, i18n } = useTranslation("auth");
  const { t: tCommon } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const loginMutation = useLoginMutation();
  const setLocale = usePreferencesStore((state) => state.setLocale);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const state = location.state as LoginLocationState | null;
  const redirectPath = state?.from?.pathname ?? "/";

  if (isAuthenticated) {
    return <Navigate replace to={redirectPath} />;
  }

  async function handleSubmit(values: LoginFormValues) {
    setErrorMessage(undefined);
    try {
      await loginMutation.mutateAsync({ phone: values.phone, password: values.password });
      await navigate(redirectPath, { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof BizError ? error.message : t("LOGINV"));
    }
  }

  const locale: AppLocale = supportedLocales.includes(i18n.language as AppLocale)
    ? (i18n.language as AppLocale)
    : "zh-CN";

  return (
    <main className="grid min-h-screen bg-background text-foreground lg:grid-cols-[1.4fr_1fr]">
      <section className="bg-sidebar-gradient relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-sidebar-primary text-xs font-bold">
            OTD
          </span>
          <div className="leading-tight">
            <p className="font-semibold">{tCommon("BRAND_NAME")}</p>
            <p className="text-[11px] tracking-[0.2em] text-white/60">{tCommon("BRAND_TAGLINE")}</p>
          </div>
        </div>
        <div className="max-w-xl">
          <h1 className="text-4xl leading-tight font-bold">
            <span className="mr-3 rounded-lg bg-sidebar-primary px-3 py-1">OTD</span>
            {t("LP_TITLE")}
          </h1>
          <p className="mt-5 text-base leading-7 text-white/75">{t("LP_SLOGAN")}</p>
        </div>
        <ul className="grid grid-cols-4 gap-6">
          {FEATURES.map((feature) => (
            <li className="border-t border-white/20 pt-4" key={feature.title}>
              <feature.icon aria-hidden="true" className="mb-2 size-5 text-white/80" />
              <p className="text-sm font-semibold">{t(feature.title)}</p>
              <p className="mt-1 text-xs text-white/60">{t(feature.desc)}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">{t("Apw3I7")}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{t("LOGSUB")}</p>
            </div>
            <LocaleSwitcher
              locale={locale}
              onLocaleChange={(next) => {
                setLocale(next);
                void i18n.changeLanguage(next);
              }}
            />
          </div>
          <LoginForm
            errorMessage={errorMessage}
            isSubmitting={loginMutation.isPending}
            showDemoAccounts={config.showDemoAccounts}
            onSubmit={handleSubmit}
          />
        </div>
      </section>
    </main>
  );
}
