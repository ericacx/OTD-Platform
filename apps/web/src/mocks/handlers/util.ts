import { HttpResponse } from "msw";

export function envelope<T>(data: T) {
  return { errcode: 0, errmsg: "", data, requestId: "mock" };
}

export function fail(code: string, message: string, status: number, params: Record<string, unknown> = {}) {
  return HttpResponse.json({ errcode: code, errmsg: message, errParams: params, requestId: "mock" }, { status });
}

export function pageOf<T>(items: T[], url: URL) {
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
  const keyword = url.searchParams.get("keyword")?.toLowerCase();
  const filtered = keyword ? items.filter((item) => JSON.stringify(item).toLowerCase().includes(keyword)) : items;
  return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize };
}
