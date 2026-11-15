import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";

import { createAppI18n } from "@/lib/i18n/i18n";

import { DueLabel } from "./due-label";
import { FieldGrid } from "./field-grid";
import { KpiCard } from "./kpi-card";
import { Money } from "./money";
import { ProgressTimeline } from "./progress-timeline";
import { StatusBadge, ToneBadge } from "./status-badge";
import { TrafficLight } from "./traffic-light";

import type { i18n as I18n } from "i18next";
import type { ReactNode } from "react";

let i18n: I18n;

beforeAll(async () => {
  i18n = await createAppI18n({ lng: "zh-CN" });
});

function wrap(node: ReactNode) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{node}</MemoryRouter>
    </I18nextProvider>,
  );
}

describe("business components", () => {
  it("renders status labels and tones from the shared state machines", () => {
    wrap(
      <>
        <StatusBadge code="PENDING_CONFIRM" machine="order" />
        <StatusBadge code="COMPLETED" machine="testRequest" />
        <StatusBadge code={null} machine="order" />
      </>,
    );
    expect(screen.getByText("待确认")).toHaveAttribute("data-tone", "warning");
    expect(screen.getByText("测试完成")).toHaveAttribute("data-tone", "success");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders tone badges and traffic lights", () => {
    wrap(
      <>
        <ToneBadge label="自定义" tone="danger" />
        <TrafficLight light="RED" />
      </>,
    );
    expect(screen.getByText("自定义")).toHaveAttribute("data-tone", "danger");
    expect(screen.getByText("红灯")).toBeInTheDocument();
  });

  it("renders the progress timeline with gates, states and slow durations", () => {
    wrap(
      <ProgressTimeline
        steps={[
          { key: "N01", title: "企划接入", state: "done", description: "已确认" },
          {
            key: "N05",
            title: "开发移交",
            state: "current",
            gate: true,
            link: { to: "/documents/handovers" },
            duration: { spentHours: 86, avgHours: 72 },
          },
          { key: "N09", title: "验货与放行", state: "blocked", gate: true },
          { key: "N10", title: "出货与结算", state: "na" },
        ]}
      />,
    );
    expect(screen.getAllByLabelText("闸门节点")).toHaveLength(2);
    expect(screen.getByText("慢于平均")).toBeInTheDocument();
    expect(screen.getByText("3.6 天")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /去处理/ })).toHaveAttribute("href", "/documents/handovers");
    expect(screen.getByText("受阻")).toBeInTheDocument();
    expect(screen.getByText("不适用")).toBeInTheDocument();
  });

  it("renders field grids with dashes for empty values", () => {
    wrap(
      <FieldGrid
        items={[
          { label: "订单号", value: "PO0010459" },
          { label: "备注", value: null },
        ]}
      />,
    );
    expect(screen.getByText("PO0010459")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders KPI cards, money and due labels", () => {
    wrap(
      <>
        <KpiCard hint="订单 3 · 企划打样 15" label="待办事项" unit="项" value={33} />
        <Money amount={62480} currency="USD" />
        <DueLabel due="2026-10-17" now={new Date(2026, 9, 21, 10)} />
      </>,
    );
    expect(screen.getByText("待办事项")).toBeInTheDocument();
    expect(screen.getByText("33")).toBeInTheDocument();
    expect(screen.getByText("USD 62,480.00")).toBeInTheDocument();
    expect(screen.getByText("任务逾期 4 天")).toBeInTheDocument();
  });
});
