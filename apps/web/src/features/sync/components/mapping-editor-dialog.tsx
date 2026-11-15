import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ToneBadge } from "@/components/biz/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { SYNC_DIRECTIONS, SYNC_OBJECTS, SYNC_TRANSFORMS, useSyncLabels } from "../sync.labels";
import { usePreviewMappingMutation, useSaveMappingMutation } from "../sync.mutations";

import type {
  SyncCodeMaps,
  SyncEndpointDto,
  SyncMappingDto,
  SyncMappingField,
  SyncMappingPreviewResult,
} from "../sync.types";
import type { SyncTransform } from "@otd/contracts/sync";

type FieldRow = { source: string; target: string; transform: SyncTransform | ""; args: string; required: boolean };
type MapRow = { name: string; entries: string };
type Draft = {
  name: string;
  endpointId: string;
  object: (typeof SYNC_OBJECTS)[number];
  direction: (typeof SYNC_DIRECTIONS)[number];
  keyField: string;
  fields: FieldRow[];
  maps: MapRow[];
};

const SELECT = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

function toDraft(mapping: SyncMappingDto | null): Draft {
  return {
    name: mapping?.name ?? "",
    endpointId: mapping?.endpointId ?? "",
    object: mapping?.object ?? "ORDER_DUE",
    direction: mapping?.direction ?? "PUSH",
    keyField: mapping?.keyField ?? "",
    fields: (mapping?.fields ?? []).map((f) => ({
      source: f.source ?? "",
      target: f.target,
      transform: f.transform ?? "",
      args: f.args && Object.keys(f.args).length ? JSON.stringify(f.args) : "",
      required: Boolean(f.required),
    })),
    maps: Object.entries(mapping?.codeMaps ?? {}).map(([name, table]) => ({
      name,
      entries: Object.entries(table)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
    })),
  };
}

function parseArgs(text: string): Record<string, unknown> | null {
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function buildFields(rows: FieldRow[]): SyncMappingField[] | null {
  const out: SyncMappingField[] = [];
  for (const r of rows) {
    if (!r.target.trim()) continue;
    const args = parseArgs(r.args);
    if (args === null) return null;
    out.push({
      source: r.source.trim(),
      target: r.target.trim(),
      ...(r.transform ? { transform: r.transform } : {}),
      ...(Object.keys(args).length ? { args } : {}),
      ...(r.required ? { required: true } : {}),
    });
  }
  return out;
}

function buildMaps(rows: MapRow[]): SyncCodeMaps {
  const out: SyncCodeMaps = {};
  for (const m of rows) {
    if (!m.name.trim()) continue;
    const table: Record<string, string> = {};
    for (const line of m.entries.split("\n")) {
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      table[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    out[m.name.trim()] = table;
  }
  return out;
}

type MappingEditorDialogProps = {
  open: boolean;
  mapping: SyncMappingDto | null;
  endpoints: SyncEndpointDto[];
  onClose: () => void;
};

export function MappingEditorDialog({ open, mapping, endpoints, onClose }: MappingEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open ? (
        <MappingEditorBody endpoints={endpoints} key={mapping?.id ?? "new"} mapping={mapping} onClose={onClose} />
      ) : null}
    </Dialog>
  );
}

function MappingEditorBody({ mapping, endpoints, onClose }: Omit<MappingEditorDialogProps, "open">) {
  const { t } = useTranslation("sync");
  const { t: tc } = useTranslation();
  const labels = useSyncLabels();
  const save = useSaveMappingMutation();
  const preview = usePreviewMappingMutation();
  const [draft, setDraft] = useState<Draft>(() => toDraft(mapping));
  const [sample, setSample] = useState("");
  const [result, setResult] = useState<SyncMappingPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const patchField = (index: number, p: Partial<FieldRow>) =>
    setDraft((d) => ({ ...d, fields: d.fields.map((f, i) => (i === index ? { ...f, ...p } : f)) }));
  const patchMap = (index: number, p: Partial<MapRow>) =>
    setDraft((d) => ({ ...d, maps: d.maps.map((m, i) => (i === index ? { ...m, ...p } : m)) }));

  async function runPreview() {
    setError(null);
    const fields = buildFields(draft.fields);
    const parsedSample = sample.trim() ? parseArgs(sample) : undefined;
    if (!fields || parsedSample === null) {
      setError(t("JSON_INVALID"));
      return;
    }
    try {
      const res = await preview.mutateAsync({
        ...(mapping ? { mappingId: mapping.id } : {}),
        object: draft.object,
        fields,
        codeMaps: buildMaps(draft.maps),
        ...(parsedSample ? { sample: parsedSample } : {}),
      });
      setResult(res);
      if (!sample.trim() && res.sample) setSample(JSON.stringify(res.sample, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("BIZERR"));
    }
  }

  async function submit() {
    setError(null);
    const fields = buildFields(draft.fields);
    if (!fields) {
      setError(t("JSON_INVALID"));
      return;
    }
    if (!draft.name.trim() || !draft.endpointId) {
      setError(tc("FRMREQ"));
      return;
    }
    const input = {
      name: draft.name.trim(),
      endpointId: draft.endpointId,
      object: draft.object,
      direction: draft.direction,
      keyField: draft.keyField.trim() || null,
      fields,
      codeMaps: buildMaps(draft.maps),
      enabled: mapping?.enabled ?? true,
    };
    try {
      await save.mutateAsync(mapping ? { id: mapping.id, input: { ...input, version: mapping.version } } : { input });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("BIZERR"));
    }
  }

  return (
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[1040px]">
      <DialogHeader>
        <DialogTitle>{mapping ? t("MAPPING_EDIT") : t("MAPPING_NEW")}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-5">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="mapping-name">{t("NAME")}</Label>
          <Input id="mapping-name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mapping-endpoint">{t("ENDPOINT")}</Label>
          <select
            className={SELECT}
            id="mapping-endpoint"
            value={draft.endpointId}
            onChange={(e) => patch({ endpointId: e.target.value })}
          >
            <option value="">—</option>
            {endpoints.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mapping-object">{t("OBJECT")}</Label>
          <select
            className={SELECT}
            id="mapping-object"
            value={draft.object}
            onChange={(e) => patch({ object: e.target.value as Draft["object"] })}
          >
            {SYNC_OBJECTS.map((o) => (
              <option key={o} value={o}>
                {labels.object(o)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mapping-direction">{t("DIRECTION")}</Label>
          <select
            className={SELECT}
            id="mapping-direction"
            value={draft.direction}
            onChange={(e) => patch({ direction: e.target.value as Draft["direction"] })}
          >
            {SYNC_DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {labels.direction(d)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="mapping-key">{t("KEY_FIELD")}</Label>
          <Input id="mapping-key" value={draft.keyField} onChange={(e) => patch({ keyField: e.target.value })} />
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("FIELD_ROWS")}</h3>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="h-9 px-2 font-medium">{t("SOURCE")}</th>
                <th className="px-2 font-medium">{t("TARGET")}</th>
                <th className="px-2 font-medium">{t("TRANSFORM")}</th>
                <th className="px-2 font-medium">{t("ARGS")}</th>
                <th className="px-2 font-medium">{t("REQUIRED")}</th>
                <th className="px-2" />
              </tr>
            </thead>
            <tbody>
              {draft.fields.map((f, index) => (
                <tr className="border-t border-border" key={index}>
                  <td className="p-1.5">
                    <Input
                      aria-label={`${t("SOURCE")} ${index + 1}`}
                      className="h-8 font-mono text-xs"
                      value={f.source}
                      onChange={(e) => patchField(index, { source: e.target.value })}
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      aria-label={`${t("TARGET")} ${index + 1}`}
                      className="h-8 font-mono text-xs"
                      value={f.target}
                      onChange={(e) => patchField(index, { target: e.target.value })}
                    />
                  </td>
                  <td className="p-1.5">
                    <select
                      aria-label={`${t("TRANSFORM")} ${index + 1}`}
                      className={`${SELECT} h-8`}
                      value={f.transform}
                      onChange={(e) => patchField(index, { transform: e.target.value as FieldRow["transform"] })}
                    >
                      <option value="">{t("TRANSFORM_NONE")}</option>
                      {SYNC_TRANSFORMS.map((x) => (
                        <option key={x} value={x}>
                          {labels.transform(x)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-1.5">
                    <Input
                      aria-label={`${t("ARGS")} ${index + 1}`}
                      className="h-8 font-mono text-xs"
                      value={f.args}
                      onChange={(e) => patchField(index, { args: e.target.value })}
                    />
                  </td>
                  <td className="p-1.5 text-center">
                    <input
                      aria-label={`${t("REQUIRED")} ${index + 1}`}
                      checked={f.required}
                      type="checkbox"
                      onChange={(e) => patchField(index, { required: e.target.checked })}
                    />
                  </td>
                  <td className="p-1.5">
                    <Button
                      aria-label={`${t("REMOVE")} ${index + 1}`}
                      size="icon"
                      type="button"
                      variant="ghost"
                      onClick={() => patch({ fields: draft.fields.filter((_, i) => i !== index) })}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() =>
            patch({ fields: [...draft.fields, { source: "", target: "", transform: "", args: "", required: false }] })
          }
        >
          <Plus aria-hidden="true" className="size-4" />
          {t("FIELD_ADD")}
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("CODE_MAPS")}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {draft.maps.map((m, index) => (
            <div className="space-y-1.5 rounded-md border border-border p-2" key={index}>
              <div className="flex items-center gap-1">
                <Input
                  aria-label={`${t("CODEMAP_NAME")} ${index + 1}`}
                  className="h-8 font-mono text-xs"
                  value={m.name}
                  onChange={(e) => patchMap(index, { name: e.target.value })}
                />
                <Button
                  aria-label={`${t("REMOVE")} ${m.name}`}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() => patch({ maps: draft.maps.filter((_, i) => i !== index) })}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </div>
              <Textarea
                aria-label={`${t("CODEMAP_ENTRIES")} ${m.name}`}
                className="min-h-24 font-mono text-xs"
                placeholder="S=01"
                value={m.entries}
                onChange={(e) => patchMap(index, { entries: e.target.value })}
              />
            </div>
          ))}
        </div>
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => patch({ maps: [...draft.maps, { name: "", entries: "" }] })}
        >
          <Plus aria-hidden="true" className="size-4" />
          {t("CODEMAP_ADD")}
        </Button>
      </section>

      <section className="space-y-2 rounded-md border border-dashed border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t("PREVIEW")}</h3>
          <Button
            disabled={preview.isPending}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => void runPreview()}
          >
            {t("PREVIEW_RUN")}
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mapping-sample">{t("SAMPLE")}</Label>
            <Textarea
              className="min-h-36 font-mono text-xs"
              id="mapping-sample"
              value={sample}
              onChange={(e) => setSample(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t("OUTPUT")}</p>
            <pre aria-label={t("OUTPUT")} className="min-h-36 overflow-auto rounded-md bg-muted p-2 font-mono text-xs">
              {result ? JSON.stringify(result.output, null, 2) : "—"}
            </pre>
          </div>
        </div>
        {result ? (
          result.errors.length ? (
            <table className="w-full text-sm">
              <tbody>
                {result.errors.map((e, i) => (
                  <tr className="border-t border-border" key={`${e.field}-${i}`}>
                    <td className="py-1.5 pr-2 font-mono text-xs">{e.field}</td>
                    <td className="pr-2">
                      <ToneBadge label={labels.errorType(e.type)} tone="danger" />
                    </td>
                    <td className="pr-2">{e.message}</td>
                    <td className="text-muted-foreground">{e.suggestion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <ToneBadge label={t("PREVIEW_OK")} tone="success" />
          )
        ) : null}
      </section>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {tc("ZCYE20")}
        </Button>
        <Button disabled={save.isPending} type="button" onClick={() => void submit()}>
          {save.isPending ? tc("SBWT01") : tc("wodHc6")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
