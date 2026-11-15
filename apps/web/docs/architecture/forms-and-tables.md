# 表单与表格

## 表单

- 基座：React Hook Form + Zod
- Resolver：`@hookform/resolvers/zod`
- 底层原子：`src/components/ui/`（shadcn Input / Textarea / Label 等）
- 业务薄封装：`src/components/form/`
  - `FormFieldText`：文本 / email / password / search / tel / url / number（内部用 shadcn `<Input>` + `<Label>`）
  - `FormFieldSelect`：原生 `<select>` + shadcn `<Label>`（需要 Radix 富交互时改用 `@/components/ui/select` 的 `<Select>` + `<Controller>`）
  - `FormFieldTextarea`：shadcn `<Textarea>`
  - `FormFieldDate`：shadcn `<Input type="date">`
- 每个字段自动生成 `<Label htmlFor>` + 错误提示（`role="alert"`）+ `aria-invalid`
- shadcn 官方 `<Form>` + `<FormField>` + `<FormItem>` 组合可用于复杂表单（`@/components/ui/form`），本模板的薄封装是保留 `register` API 的快速通道

### 典型写法

```tsx
const schema = z.object({
  name: z.string().min(1, { message: "form.required" }),
  email: z.string().email({ message: "form.invalid" }),
});

const form = useForm<z.infer<typeof schema>>({
  resolver: zodResolver(schema),
  defaultValues: { name: "", email: "" },
});

return (
  <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}>
    <FormFieldText
      error={form.formState.errors.name?.message}
      label={t("field.name")}
      name="name"
      register={form.register}
    />
    ...
  </form>
);
```

### schema 里放 i18n key

`z.string().email({ message: "form.invalid" })` 里的 message 是 i18n key，业务组件 render 时用 `t(message)` 翻译。这样一份 schema 可支持多语言。

### 提交错误

Mutation 抛出 `BizError` 时，业务组件在 `catch` 里映射到 i18n 提示。见 `src/pages/login/login.page.tsx`。

## 表格

- 基座：TanStack Table v8
- 通用组件：`src/components/data-table/`

### 现状能力

- 分页（`DataTablePagination`，支持 controlled `onPageChange`）
- 排序（`sorting + onSortingChange` prop，controlled）
- 筛选（`columnFilters + onColumnFiltersChange`，controlled）
- 行选择（`rowSelection + onRowSelectionChange`）
- Loading / Empty / Error 三态（复用 `components/common`）
- getRowId 自定义

### 使用

```tsx
const columns = useUsersColumns();
const { data } = useUsersQuery(params);

<DataTable
  columns={columns}
  data={data ?? []}
  emptyText={t("list.empty")}
  getRowId={(u) => u.id}
  isLoading={data === undefined}
/>;
```

### 扩展方向（后续 issue）

- URL 同步（`useSearchParamsSchema(zodSchema)` + 分页参数）
- 列显隐 / 密度切换
- CSV 导出
- 拖拽换列

这些暂时按需在业务侧封装即可，不放入 Core 模板。

## 通用状态组件

- `LoadingState` — spinner + i18n `state.loading`
- `EmptyState` — 图标 + 标题 / 描述 / action
- `ErrorState` — 危险色 + error.message
- `PageHeader` — eyebrow / title / description / actions

推荐所有页面组装以 `<PageHeader/>` 开头，主体用这些三态组件包裹接口结果。
