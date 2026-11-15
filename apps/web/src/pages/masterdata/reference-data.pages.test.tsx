import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { server } from "@/mocks/server";
import { renderWithProviders } from "@/test/render-with-providers";

describe("master data pages", () => {
  beforeEach(() => {
    setTokenInfo({ accessToken: "mock-access-13800000000", refreshToken: "mock-refresh-13800000000" });
  });

  it("creates, edits and soft-deletes factories with versions", async () => {
    let created: Record<string, unknown> | null = null;
    let updated: Record<string, unknown> | null = null;
    let deletedUrl: string | null = null;
    server.use(
      http.post("*/masterdata/factories", async ({ request }) => {
        created = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { errcode: 0, data: { ...created, id: "f-new", version: 1 }, requestId: "t" },
          { status: 201 },
        );
      }),
      http.put("*/masterdata/factories/:id", async ({ request }) => {
        updated = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ errcode: 0, data: { ...updated, id: "f-2" }, requestId: "t" });
      }),
      http.delete("*/masterdata/factories/:id", ({ request }) => {
        deletedUrl = request.url;
        return HttpResponse.json({ errcode: 0, data: null, requestId: "t" });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/masterdata/factories" });

    expect(await screen.findByRole("heading", { name: "工厂与基地" })).toBeInTheDocument();
    const bases = await screen.findByRole("list", { name: "基地" });
    expect(within(bases).getByText("东城基地")).toBeInTheDocument();
    expect(within(bases).getByText("856")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "新建工厂" }));
    let dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("编码"), "PP1");
    await user.type(within(dialog).getByLabelText("名称"), "金边一厂");
    await user.selectOptions(within(dialog).getByLabelText("所属基地"), "b-2");
    await user.type(within(dialog).getByLabelText("工厂主体"), "OTD Knitting Cambodia");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(created).not.toBeNull());
    expect(created).toEqual({
      code: "PP1",
      name: "金边一厂",
      nameEn: null,
      baseId: "b-2",
      legalEntity: "OTD Knitting Cambodia",
    });

    const row = (await screen.findByText("东城二厂")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "编辑" }));
    dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByLabelText("名称");
    await user.clear(name);
    await user.type(name, "东城二厂（新园区）");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(updated).not.toBeNull());
    expect(updated).toMatchObject({ code: "DC2", name: "东城二厂（新园区）", baseId: "b-1", version: 2 });

    await user.click(within(row).getByRole("button", { name: "删除" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText(/东城二厂/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "确认" }));
    await waitFor(() => expect(deletedUrl).not.toBeNull());
    expect(new URL(deletedUrl!).searchParams.get("version")).toBe("2");
  });

  it("shows why a base in use cannot be deleted", async () => {
    const user = userEvent.setup();
    await renderWithProviders({ route: "/masterdata/factories" });

    await user.click(await screen.findByRole("button", { name: "删除 东城基地" }));
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "确认" }));
    expect(await within(confirm).findByText(/仍有 858 条关联数据/)).toBeInTheDocument();
  });

  it("filters factories by base", async () => {
    const seen: string[] = [];
    server.use(
      http.get("*/masterdata/factories", ({ request }) => {
        seen.push(new URL(request.url).searchParams.get("baseId") ?? "");
        return HttpResponse.json({ errcode: 0, data: { items: [], total: 0, page: 1, pageSize: 20 }, requestId: "t" });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/masterdata/factories" });

    const bases = await screen.findByRole("list", { name: "基地" });
    await user.click(within(bases).getByRole("button", { name: /^NH\s*南湖基地/ }));
    await waitFor(() => expect(seen).toContain("b-2"));
    expect(screen.getByLabelText("按基地筛选")).toHaveValue("b-2");
  });

  it("edits base machines with the record version", async () => {
    let updated: Record<string, unknown> | null = null;
    server.use(
      http.put("*/masterdata/base-machines/:id", async ({ request }) => {
        updated = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ errcode: 0, data: null, requestId: "t" });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/masterdata/needle-types" });

    expect(await screen.findByRole("heading", { name: "针型与机台" })).toBeInTheDocument();
    const needleRow = (await screen.findByText("168N")).closest("tr")!;
    expect(within(needleRow).getAllByText("—").length).toBeGreaterThan(0);
    const capacityCell = await screen.findByText("52,026");
    const row = capacityCell.closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "编辑" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("DC · 东城基地")).toBeInTheDocument();
    const count = within(dialog).getByLabelText("开机台数");
    await user.clear(count);
    await user.type(count, "300");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(updated).not.toBeNull());
    expect(updated).toMatchObject({ baseId: "b-1", needleTypeId: "n-1", machineCount: 300, version: 1 });
  });

  it("switches dictionary tabs, disables entries and filters exchange rates", async () => {
    let disabledUrl: string | null = null;
    const currencies: string[] = [];
    server.use(
      http.delete("*/masterdata/dictionaries/:id", ({ request }) => {
        disabledUrl = request.url;
        return HttpResponse.json({ errcode: 0, data: null, requestId: "t" });
      }),
      http.get("*/masterdata/exchange-rates", ({ request }) => {
        const currency = new URL(request.url).searchParams.get("currency") ?? "";
        currencies.push(currency);
        const items = [
          { id: "x-1", currency: "USD", rateToCny: 7.18, effectiveDate: "2026-10-15", version: 1 },
          { id: "x-3", currency: "EUR", rateToCny: 7.75, effectiveDate: "2026-10-01", version: 1 },
        ].filter((r) => !currency || r.currency === currency);
        return HttpResponse.json({
          errcode: 0,
          data: { items, total: items.length, page: 1, pageSize: 20 },
          requestId: "t",
        });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/masterdata/dictionaries" });

    const types = await screen.findByRole("navigation", { name: "字典类型" });
    expect(await within(types).findByText("transportMode")).toBeInTheDocument();
    const row = (await screen.findByText("女袜")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "停用" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText(/女袜/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "停用" }));
    await waitFor(() => expect(disabledUrl).toContain("/masterdata/dictionaries/d-1"));

    await user.click(screen.getByRole("tab", { name: "汇率" }));
    expect(await screen.findByText("7.18")).toBeInTheDocument();
    expect(screen.getByText("7.75")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("币种"), "USD");
    await waitFor(() => expect(currencies).toContain("USD"));
    await waitFor(() => expect(screen.queryByText("7.75")).not.toBeInTheDocument());

    await user.click(screen.getByRole("tab", { name: "季节" }));
    expect(await screen.findByText("FA27")).toBeInTheDocument();
  });
});
