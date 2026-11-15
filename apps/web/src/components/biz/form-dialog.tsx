import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, type DefaultValues, type FieldValues, type Resolver, type UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import type { ReactNode } from "react";
import type { z } from "zod";

const WIDTH = { sm: "sm:max-w-[560px]", md: "sm:max-w-[720px]", lg: "sm:max-w-[960px]" } as const;

type FormDialogProps<TValues extends FieldValues> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  schema: z.ZodType<TValues>;
  defaultValues: DefaultValues<TValues>;
  onSubmit: (values: TValues) => Promise<unknown>;
  children: (form: UseFormReturn<TValues>) => ReactNode;
  submitLabel?: string;
  width?: keyof typeof WIDTH;
};

type BodyProps<TValues extends FieldValues> = Pick<
  FormDialogProps<TValues>,
  "schema" | "defaultValues" | "onSubmit" | "children"
> & { submitLabel?: string | undefined; onDone: () => void };

function FormDialogBody<TValues extends FieldValues>({
  schema,
  defaultValues,
  onSubmit,
  children,
  submitLabel,
  onDone,
}: BodyProps<TValues>) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<TValues>({
    defaultValues,
    resolver: zodResolver(schema as unknown as z.ZodType<TValues, FieldValues>) as unknown as Resolver<TValues>,
  });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await onSubmit(values);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("BIZERR"));
    }
  });

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      {children(form)}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("ZCYE20")}
        </Button>
        <Button disabled={form.formState.isSubmitting} type="submit">
          {form.formState.isSubmitting ? t("SBWT01") : (submitLabel ?? t("wodHc6"))}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function FormDialog<TValues extends FieldValues>({
  open,
  onOpenChange,
  title,
  description,
  schema,
  defaultValues,
  onSubmit,
  children,
  submitLabel,
  width = "sm",
}: FormDialogProps<TValues>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto", WIDTH[width])}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <FormDialogBody
          defaultValues={defaultValues}
          schema={schema}
          submitLabel={submitLabel}
          onDone={() => onOpenChange(false)}
          onSubmit={onSubmit}
        >
          {children}
        </FormDialogBody>
      </DialogContent>
    </Dialog>
  );
}
