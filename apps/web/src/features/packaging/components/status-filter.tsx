import { pickLabel, statusCodes, statusLabel, type MachineKey } from "@otd/shared";
import { useTranslation } from "react-i18next";

type StatusFilterProps = {
  machine: MachineKey;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  allLabel: string;
  label: string;
};

export function StatusFilter({ machine, value, onChange, allLabel, label }: StatusFilterProps) {
  const { i18n } = useTranslation();
  return (
    <select
      aria-label={label}
      className="h-9 rounded-md border border-input bg-card px-2 text-sm"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || undefined)}
    >
      <option value="">{allLabel}</option>
      {statusCodes(machine).map((code) => (
        <option key={code} value={code}>
          {pickLabel(statusLabel(machine, code), i18n.language)}
        </option>
      ))}
    </select>
  );
}

type CustomerFilterProps = {
  customers: { id: string; name: string }[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  allLabel: string;
  label: string;
};

export function CustomerFilter({ customers, value, onChange, allLabel, label }: CustomerFilterProps) {
  return (
    <select
      aria-label={label}
      className="h-9 rounded-md border border-input bg-card px-2 text-sm"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || undefined)}
    >
      <option value="">{allLabel}</option>
      {customers.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
