import { FileUp, Loader2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/lib/http/client";
import { cn } from "@/lib/utils";

export type UploadedFile = { id: string; filename: string; contentType: string; size: number; createdAt: string };

type FileUploadProps = {
  accept?: string;
  hint?: string;
  onUploaded: (file: UploadedFile) => void;
  className?: string;
  disabled?: boolean;
};

export async function uploadFile(file: File): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file);
  return api.post<UploadedFile>("/files", form);
}

export function FileUpload({ accept, hint, onUploaded, className, disabled = false }: FileUploadProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handle(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onUploaded(await uploadFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("UPLOAD_FAILED"));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={className}>
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center transition-colors hover:border-primary/50",
          dragging && "border-primary bg-primary-soft/40",
          (disabled || busy) && "pointer-events-none opacity-60",
        )}
        htmlFor={inputId}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handle(event.dataTransfer.files);
        }}
      >
        {busy ? (
          <Loader2 aria-hidden="true" className="size-5 animate-spin text-primary" />
        ) : (
          <FileUp aria-hidden="true" className="size-5 text-primary" />
        )}
        <span className="text-sm font-medium">{busy ? t("UPLOADING") : t("UPLOAD_HINT")}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </label>
      <input
        accept={accept}
        className="sr-only"
        disabled={disabled || busy}
        id={inputId}
        ref={inputRef}
        type="file"
        onChange={(event) => {
          void handle(event.target.files);
        }}
      />
      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
