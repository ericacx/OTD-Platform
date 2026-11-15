import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import type { FieldValues, Path, UseFormRegister } from "react-hook-form";

type NativeInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "name" | "type" | "defaultValue" | "value" | "onChange" | "onBlur"
>;

type FormFieldTextProps<TFieldValues extends FieldValues> = NativeInputProps & {
  error?: string | undefined;
  label: string;
  name: Path<TFieldValues>;
  register: UseFormRegister<TFieldValues>;
  type?: "email" | "password" | "text" | "search" | "tel" | "url" | "number";
};

export function FormFieldText<TFieldValues extends FieldValues>({
  className,
  error,
  label,
  name,
  register,
  type = "text",
  ...inputProps
}: FormFieldTextProps<TFieldValues>) {
  const inputId = useId();
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="space-y-1.5">
      <Label className={cn(error && "text-destructive")} htmlFor={inputId}>
        {label}
      </Label>
      <Input
        {...inputProps}
        {...register(name)}
        aria-describedby={errorId}
        aria-invalid={Boolean(error) || undefined}
        className={className}
        id={inputId}
        type={type}
      />
      {error ? (
        <p className="text-sm font-medium text-destructive" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
