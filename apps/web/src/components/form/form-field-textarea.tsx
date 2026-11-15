import { useId } from "react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { FieldValues, Path, UseFormRegister } from "react-hook-form";

type NativeTextareaProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "name" | "defaultValue" | "value" | "onChange" | "onBlur"
>;

type FormFieldTextareaProps<TFieldValues extends FieldValues> = NativeTextareaProps & {
  error?: string | undefined;
  label: string;
  name: Path<TFieldValues>;
  register: UseFormRegister<TFieldValues>;
};

export function FormFieldTextarea<TFieldValues extends FieldValues>({
  className,
  error,
  label,
  name,
  register,
  rows = 4,
  ...textareaProps
}: FormFieldTextareaProps<TFieldValues>) {
  const inputId = useId();
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="space-y-1.5">
      <Label className={cn(error && "text-destructive")} htmlFor={inputId}>
        {label}
      </Label>
      <Textarea
        {...textareaProps}
        {...register(name)}
        aria-describedby={errorId}
        aria-invalid={Boolean(error) || undefined}
        className={className}
        id={inputId}
        rows={rows}
      />
      {error ? (
        <p className="text-sm font-medium text-destructive" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
