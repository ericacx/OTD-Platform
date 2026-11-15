import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormFieldText } from "@/components/form/form-field-text";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const DEMO_ACCOUNTS = [
  { phone: "13800000000", labelKey: "DEMO_ADMIN" },
  { phone: "13800000001", labelKey: "DEMO_SALES" },
  { phone: "13800000002", labelKey: "DEMO_MANAGER" },
  { phone: "13800000003", labelKey: "DEMO_GM" },
] as const;

export const DEMO_PASSWORD = "otd2026demo";

const formSchema = z.object({
  phone: z.string().regex(/^1\d{10}$/, { message: "LOGPHINV" }),
  password: z.string().min(1, { message: "FRMREQ" }),
});

export type LoginFormValues = z.infer<typeof formSchema>;

interface LoginFormProps {
  errorMessage?: string | undefined;
  isSubmitting?: boolean | undefined;
  showDemoAccounts?: boolean;
  onSubmit: (values: LoginFormValues) => void | Promise<void>;
}

const RESOLVER = zodResolver(formSchema);

export function LoginForm({ errorMessage, isSubmitting = false, showDemoAccounts = false, onSubmit }: LoginFormProps) {
  const { t } = useTranslation("auth");
  const { t: tCommon } = useTranslation();
  const form = useForm<LoginFormValues>({ defaultValues: { phone: "", password: "" }, resolver: RESOLVER });

  function translateError(message: string | undefined): string | undefined {
    if (!message) return undefined;
    if (message === "LOGPHINV") return t("LOGPHINV");
    if (message === "FRMREQ") return tCommon("FRMREQ");
    return message;
  }

  return (
    <div>
      <form
        className="mt-6 space-y-4"
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit(onSubmit)(event);
        }}
      >
        <FormFieldText
          autoComplete="username"
          error={translateError(form.formState.errors.phone?.message)}
          inputMode="numeric"
          label={t("LOGPHONE")}
          name="phone"
          placeholder={t("LOGPHPH")}
          register={form.register}
          type="tel"
        />
        <FormFieldText
          autoComplete="current-password"
          error={translateError(form.formState.errors.password?.message)}
          label={t("LOGPWD")}
          name="password"
          placeholder={t("LOGPPH")}
          register={form.register}
          type="password"
        />
        {errorMessage ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        <Button className="w-full" disabled={isSubmitting} size="lg" type="submit">
          {isSubmitting ? t("LOGSMBING") : t("LOGSMBT")}
        </Button>
      </form>
      {showDemoAccounts ? (
        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">{t("DEMO_HINT")}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                key={account.phone}
                type="button"
                onClick={() => {
                  form.setValue("phone", account.phone, { shouldValidate: true });
                  form.setValue("password", DEMO_PASSWORD, { shouldValidate: true });
                }}
              >
                {t(account.labelKey)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
