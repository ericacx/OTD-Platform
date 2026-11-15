import { useId } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import type { FieldValues, Path, UseFormRegister } from "react-hook-form";

interface SelectOption {
  label: string;
  value: string;
}

interface FormFieldSelectProps<TFieldValues extends FieldValues> {
  className?: string;
  disabled?: boolean;
  error?: string | undefined;
  label: string;
  name: Path<TFieldValues>;
  options: SelectOption[];
  register: UseFormRegister<TFieldValues>;
}

/**
 * Native `<select>` wrapped with shadcn Label. For a richer Radix-driven
 * picker with search / groups, use `@/components/ui/select` directly and
 * wire it through `<Controller>` instead of `register`.
 */
export function FormFieldSelect<TFieldValues extends FieldValues>({
  className,
  disabled,
  error,
  label,
  name,
  options,
  register,
}: FormFieldSelectProps<TFieldValues>) {
  const inputId = useId();
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="space-y-1.5">
      <Label className={cn(error && "text-destructive")} htmlFor={inputId}>
        {label}
      </Label>
      <select
        aria-describedby={errorId}
        aria-invalid={Boolean(error) || undefined}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        disabled={disabled}
        id={inputId}
        {...register(name)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="text-sm font-medium text-destructive" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
