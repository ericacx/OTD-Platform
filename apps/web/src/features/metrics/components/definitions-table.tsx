import { BOARD_TITLES, type BoardKey, type MetricDefinitionDto } from "@otd/contracts/metrics";
import { pickLabel } from "@otd/shared";
import { useTranslation } from "react-i18next";

type DefinitionsTableProps = { definitions: MetricDefinitionDto[]; board?: BoardKey | undefined };

export function DefinitionsTable({ definitions, board }: DefinitionsTableProps) {
  const { t, i18n } = useTranslation("metrics");
  const lang = i18n.language;
  const list = board ? definitions.filter((d) => d.boards.includes(board)) : definitions;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted text-left text-muted-foreground">
          <tr>
            <th className="h-11 px-3 font-medium">{t("DEF_COL_NAME")}</th>
            {board ? null : <th className="px-3 font-medium">{t("DEF_COL_BOARD")}</th>}
            <th className="px-3 font-medium">{t("DEF_COL_DEFINITION")}</th>
            <th className="px-3 font-medium">{t("DEF_COL_FORMULA")}</th>
            <th className="px-3 font-medium">{t("DEF_COL_TIME")}</th>
            <th className="px-3 font-medium">{t("DEF_COL_SOURCE")}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((d) => (
            <tr className="border-t border-border align-top" data-testid={`def-${d.key}`} key={d.key}>
              <td className="px-3 py-2.5 font-medium whitespace-nowrap">{pickLabel(d.name, lang)}</td>
              {board ? null : <td className="px-3 py-2.5 text-xs whitespace-nowrap">{d.boards.map((b) => pickLabel(BOARD_TITLES[b], lang)).join("、")}</td>}
              <td className="px-3 py-2.5 text-xs">{pickLabel(d.definition, lang)}</td>
              <td className="px-3 py-2.5 font-mono text-xs">{pickLabel(d.formula, lang)}</td>
              <td className="px-3 py-2.5 text-xs">{pickLabel(d.timeBasis, lang)}</td>
              <td className="px-3 py-2.5 text-xs">{pickLabel(d.source, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {list[0] ? <p className="px-3 py-2 text-xs text-muted-foreground">{t("DEF_REFRESH", { text: pickLabel(list[0].refresh, lang) })}</p> : null}
    </div>
  );
}
