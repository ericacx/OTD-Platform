import { useTranslation } from "react-i18next";

import { SectionCard } from "@/components/biz/detail-header-card";
import { ToneBadge } from "@/components/biz/status-badge";

import { useRequirementsQuery } from "../purchase.queries";

import type { PurchaseRequirementDto } from "../purchase.types";
import type { ReactNode } from "react";

type Props = { orderId: string; action?: (data: PurchaseRequirementDto) => ReactNode };

export function RequirementsCard({ orderId, action }: Props) {
  const { t } = useTranslation("purchase");
  const req = useRequirementsQuery(orderId);
  const data = req.data;
  return (
    <SectionCard extra={data && action ? action(data) : null} title={t("REQ_TITLE")}>
      {!data ? (
        <p className="text-sm text-muted-foreground">{req.isLoading ? t("LOADING") : t("REQ_EMPTY")}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("REQ_BASIS", {
              poNo: data.poNo,
              pairs: data.totalPairs.toLocaleString(),
              perCarton: data.pairsPerCarton,
            })}
            {data.pairsPerCartonSource === "DEFAULT" ? ` ${t("REQ_DEFAULT_CARTON")}` : ""}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("MATERIAL")}</th>
                  <th className="px-3 py-2 font-medium">{t("REQ_BASIS_COL")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("REQ_REQUIRED")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("REQ_ORDERED")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("RECEIVED")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("REQ_SHORTAGE")}</th>
                  <th className="px-3 py-2 font-medium">{t("REQ_SUGGESTION")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr className="border-t border-border" key={item.key}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.materialCode ?? t(`CAT_${item.category}`)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{item.basis}</td>
                    <td className="tabular px-3 py-2 text-right">{`${item.required.toLocaleString()} ${item.unit}`}</td>
                    <td className="tabular px-3 py-2 text-right">{item.ordered.toLocaleString()}</td>
                    <td className="tabular px-3 py-2 text-right">{item.received.toLocaleString()}</td>
                    <td className="tabular px-3 py-2 text-right">
                      {item.shortage > 0 ? (
                        <span className="font-semibold text-danger">{item.shortage.toLocaleString()}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {item.shortage > 0 ? (
                        <ToneBadge label={t("REQ_SHORT")} tone="danger" />
                      ) : (
                        <ToneBadge label={t("REQ_OK")} tone="success" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
