import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { setTokenInfo } from "@/lib/auth/token-storage";
import { mockPlannings } from "@/mocks/handlers/planning";
import { server } from "@/mocks/server";
import { usePageDocStore } from "@/stores/page-doc.store";
import { renderWithProviders } from "@/test/render-with-providers";

describe("planning pages", () => {
  beforeEach(() => {
    setTokenInfo({ accessToken: "mock-access-13800000001", refreshToken: "mock-refresh-13800000001" });
  });

  it("lists briefs and imports a PDF through recognition to the extracted fields", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post("*/plannings", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            errcode: 0,
            requestId: "t",
            data: {
              id: "p-new",
              docNo: "BR-2610-022",
              status: "EXTRACTED",
              styleId: null,
              styleNo: "12812",
              seasonCode: "FA27",
              customerId: "c-nsr",
              customerName: "北岸运动",
              nameZh: "提花菱格中筒袜",
              nameEn: "Argyle Jacquard Crew",
              category: "WOMEN",
              subCategory: "CREW",
              defaultSize: "M",
              sizeRange: "S / M / L",
              supplier: null,
              buyerName: null,
              designer: null,
              needleCount: "168N",
              sockWeight: "Light 薄款",
              requiredSampleDate: "2026-12-06",
              briefTranslation: null,
              productAttrs: [
                {
                  key: "cuff",
                  labelZh: "罗口",
                  labelEn: "Cuff",
                  original: "Double welt 1x1 rib",
                  translated: "双层罗口 1×1",
                  confidence: 0.92,
                },
              ],
              extraction: {
                styleNo: { value: "12812", confidence: 0.97, source: "Style #12812", page: 1 },
                defaultSize: { value: "M", confidence: 0.6, source: "Sample size M", page: 1 },
              },
              lowConfidenceFields: ["defaultSize"],
              sourceFile: { id: "file-new", filename: "NSR_12812_FA27_Argyle.pdf" },
              imageFileIds: [],
              recognitionError: null,
              recognizedAt: null,
              confirmedAt: null,
              confirmedByName: null,
              archivedAt: null,
              sample: null,
              ownerId: "u",
              ownerName: "王芳",
              createdAt: "2026-10-21T01:00:00.000Z",
              updatedAt: "2026-10-21T01:00:00.000Z",
              version: 2,
            },
          },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/planning" });

    expect(await screen.findByRole("heading", { name: "企划列表" }, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText("（识别中 · 待补全）")).toBeInTheDocument();
    expect(screen.getByText("#12744")).toBeInTheDocument();
    expect(screen.queryByText("#11506")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /新建企划/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("导入企划文件")).toBeInTheDocument();
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File(["%PDF-1.4"], "argyle.pdf", { type: "application/pdf" }));
    expect(await within(dialog).findByText("NSR_12812_FA27_Argyle.pdf")).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText("客户"), "c-nsr");
    await user.click(within(dialog).getByRole("button", { name: "开始识别" }));

    expect(await within(dialog).findByText("提取完成")).toBeInTheDocument();
    expect(within(dialog).getByText("1 项待核对")).toBeInTheDocument();
    const lowRow = within(dialog).getByText("默认尺码").closest("tr")!;
    expect(lowRow).toHaveAttribute("data-low", "true");
    expect(within(dialog).getByText("双层罗口 1×1")).toBeInTheDocument();
    expect(body).toMatchObject({ customerId: "c-nsr", fileId: "file-new" });
  });

  it("shows the brief detail with low-confidence highlights and confirms it", async () => {
    let confirmed: Record<string, unknown> | null = null;
    server.use(
      http.post("*/plannings/:id/confirm", async ({ request }) => {
        confirmed = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          errcode: 0,
          requestId: "t",
          data: { ...mockPlannings[1]!, status: "CONFIRMED", sample: { id: "s-9", docNo: "SP-2610-013" }, version: 3 },
        });
      }),
    );
    const user = userEvent.setup();
    await renderWithProviders({ route: "/planning/p-2" });

    expect(await screen.findByRole("heading", { name: "企划详情" }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("#12593 · 散点花卉瑜伽防滑隐形袜")).toBeInTheDocument();
    expect(usePageDocStore.getState().doc).toEqual({ docType: "planning", docId: "p-2", docNo: "BR-2610-009" });
    const lowField = screen.getByLabelText(/默认尺码/).closest("[data-low]");
    expect(lowField).not.toBeNull();
    expect(screen.getByText("黄底为 AI 低置信度字段，请逐项核对")).toBeInTheDocument();
    expect(screen.getByDisplayValue("隐藏式罗口")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认企划信息" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "确认企划信息" }));
    await waitFor(() => expect(confirmed).toMatchObject({ version: 2, roundType: "PROTO", quantity: 6 }));
  });

  it("lists archived briefs", async () => {
    await renderWithProviders({ route: "/planning/archived" });
    expect(await screen.findByRole("heading", { name: "归档列表" }, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText("#11506")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /新建企划/ })).not.toBeInTheDocument();
  });
});
