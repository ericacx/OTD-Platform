import { hash } from "@node-rs/argon2";
import { PERMISSION_PRESETS, PRESET_ROLES, expandPermissionPatterns } from "@otd/shared";
import type { Database } from "../client.js";
import { uuidv7 } from "../id.js";
import * as t from "../schema/index.js";

export const DEMO_PASSWORD = "otd2026demo";

export const ORG_TREE = [
  { code: "ORG001", name: "OTD 集团", nameEn: "OTD Group", type: "GROUP", fn: "MANAGEMENT", parent: null },
  { code: "ORG002", name: "棉袜事业部", nameEn: "Cotton Socks Division", type: "DIVISION", fn: "SALES", parent: "ORG001" },
  { code: "ORG003", name: "业务一部", nameEn: "Sales Dept 1", type: "DEPARTMENT", fn: "SALES", parent: "ORG002" },
  { code: "ORG004", name: "业务二部", nameEn: "Sales Dept 2", type: "DEPARTMENT", fn: "SALES", parent: "ORG002" },
  { code: "ORG005", name: "无缝事业部", nameEn: "Seamless Division", type: "DIVISION", fn: "SALES", parent: "ORG001" },
  { code: "ORG006", name: "业务三部", nameEn: "Sales Dept 3", type: "DEPARTMENT", fn: "SALES", parent: "ORG005" },
  { code: "ORG007", name: "技术部", nameEn: "Technical", type: "DEPARTMENT", fn: "TECH", parent: "ORG001" },
  { code: "ORG008", name: "品质部", nameEn: "Quality", type: "DEPARTMENT", fn: "QUALITY", parent: "ORG001" },
  { code: "ORG009", name: "计划部", nameEn: "Planning", type: "DEPARTMENT", fn: "PLANNING", parent: "ORG001" },
  { code: "ORG010", name: "采购部", nameEn: "Procurement", type: "DEPARTMENT", fn: "PROCUREMENT", parent: "ORG001" },
  { code: "ORG011", name: "关务部", nameEn: "Customs", type: "DEPARTMENT", fn: "CUSTOMS", parent: "ORG001" },
  { code: "ORG012", name: "财务部", nameEn: "Finance", type: "DEPARTMENT", fn: "FINANCE", parent: "ORG001" },
  { code: "ORG013", name: "生产部", nameEn: "Production", type: "DEPARTMENT", fn: "PRODUCTION", parent: "ORG001" },
  { code: "ORG014", name: "信息部", nameEn: "IT", type: "DEPARTMENT", fn: "IT", parent: "ORG001" },
] as const;

export const DEMO_USERS = [
  { phone: "13800000000", name: "管理员", nameEn: "Admin", org: "ORG014", role: "R090", email: "admin@otd.example" },
  { phone: "13800000001", name: "王芳", nameEn: "Wang Fang", org: "ORG003", role: "R001", email: "wangfang@otd.example" },
  { phone: "13800000002", name: "李强", nameEn: "Li Qiang", org: "ORG002", role: "R002", email: "liqiang@otd.example" },
  { phone: "13800000003", name: "李国华", nameEn: "Li Guohua", org: "ORG001", role: "R003", email: "liguohua@otd.example" },
  { phone: "13800000004", name: "张伟", nameEn: "Zhang Wei", org: "ORG003", role: "R001", email: "zhangwei@otd.example" },
  { phone: "13800000005", name: "刘洋", nameEn: "Liu Yang", org: "ORG004", role: "R001", email: "liuyang@otd.example" },
  { phone: "13800000006", name: "陈静", nameEn: "Chen Jing", org: "ORG007", role: "R004", email: "chenjing@otd.example" },
  { phone: "13800000007", name: "赵敏", nameEn: "Zhao Min", org: "ORG008", role: "R005", email: "zhaomin@otd.example" },
  { phone: "13800000008", name: "孙悦", nameEn: "Sun Yue", org: "ORG009", role: "R006", email: "sunyue@otd.example" },
  { phone: "13800000009", name: "周涛", nameEn: "Zhou Tao", org: "ORG010", role: "R007", email: "zhoutao@otd.example" },
  { phone: "13800000010", name: "吴昊", nameEn: "Wu Hao", org: "ORG011", role: "R008", email: "wuhao@otd.example" },
  { phone: "13800000011", name: "郑丽", nameEn: "Zheng Li", org: "ORG012", role: "R009", email: "zhengli@otd.example" },
  { phone: "13800000012", name: "黄磊", nameEn: "Huang Lei", org: "ORG013", role: "R010", email: "huanglei@otd.example" },
  { phone: "13800000013", name: "林悦", nameEn: "Lin Yue", org: "ORG006", role: "R001", email: "linyue@otd.example" },
] as const;

export const DEMO_CUSTOMERS = [
  { code: "NSR", name: "北岸运动", nameEn: "NorthShore", terms: 60, currency: "USD", entity: "NorthShore Sports Inc." },
  { code: "MPT", name: "枫林户外", nameEn: "Maple Trail", terms: 45, currency: "USD", entity: "Maple Trail Outdoor Ltd." },
  { code: "BBY", name: "蓝湾生活", nameEn: "BlueBay", terms: 30, currency: "CNY", entity: "蓝湾生活用品有限公司" },
  { code: "MRN", name: "晨跑者", nameEn: "Morning Runner", terms: 60, currency: "EUR", entity: "Morning Runner GmbH" },
  { code: "CKD", name: "云栖童装", nameEn: "CloudKids", terms: 30, currency: "CNY", entity: "云栖童装有限公司" },
  { code: "APX", name: "极线", nameEn: "Apex Line", terms: 90, currency: "USD", entity: "Apex Line Co." },
  { code: "PLF", name: "素野", nameEn: "Plainfield", terms: 60, currency: "JPY", entity: "Plainfield K.K." },
  { code: "SSH", name: "海盐家居", nameEn: "Sea Salt Home", terms: 45, currency: "USD", entity: "Sea Salt Home LLC" },
] as const;

const SALES_REP_CUSTOMERS = ["NSR", "MPT", "BBY", "MRN", "CKD", "APX"];

const BASES = [
  { code: "DC", name: "东城基地", nameEn: "Dongcheng Base", country: "CN", factories: [["DC1", "东城一厂"], ["DC2", "东城二厂"]] },
  { code: "NH", name: "南湖基地", nameEn: "Nanhu Base", country: "CN", factories: [["NH5", "南湖五厂"]] },
  { code: "VN", name: "越南基地", nameEn: "Vietnam Base", country: "VN", factories: [["HP3", "海防三厂"]] },
] as const;

const NEEDLES = [
  ["96N", 96],
  ["120N", 120],
  ["144N", 144],
  ["168N", 168],
  ["200N", 200],
] as const;

export const SERVICE_CATALOG: { code: string; name: string; nameEn: string; department: string; hasPage: boolean; nodes: string[]; items: [string, string, string[]?][] }[] = [
  { code: "SM01", name: "企划与开发", nameEn: "Briefs & development", department: "业务部", hasPage: true, nodes: ["N01"], items: [["企划接入", "Brief intake"], ["技术资料 / 工艺单", "Tech pack"], ["客户原件提取", "Source extraction"], ["款式设计", "Design"], ["物料选型", "Material selection"], ["企划翻译", "Translation"], ["企划复核", "Review"], ["企划变更确认", "Change confirmation"]].map(([a, b]) => [a!, b!]) },
  { code: "SM02", name: "报价与定价", nameEn: "Quotation & pricing", department: "业务部", hasPage: true, nodes: ["N04"], items: [["成本核算", "Costing"], ["cost sheet 编制", "Cost sheet"], ["季节价格汇总", "Season price summary"], ["多渠道对价", "Channel pricing"]] },
  { code: "SM03", name: "打样开发", nameEn: "Sampling", department: "技术部", hasPage: true, nodes: ["N02"], items: [["颜色样", "Color sample"], ["结构样", "Structure sample"], ["尺码样", "Size sample"], ["产前样", "PP sample"], ["Lab Dip 色样", "Lab dip"], ["Knitdowns 布片", "Knitdown"], ["Concept 概念样", "Concept sample"], ["TSR 概念样", "TSR sample"], ["COLORATION 颜色样", "Coloration"], ["QRS 品质参考样", "QRS", ["G1.qrsRetained"]], ["试穿样", "Fit sample"], ["照片样", "Photo sample"]] },
  { code: "SM04", name: "寄样服务", nameEn: "Sample shipping", department: "业务部", hasPage: true, nodes: ["N02"], items: [["国际快递", "Courier"], ["客户指定货代", "Customer forwarder"], ["样品挂号", "Sample tagging"], ["样品标签制作", "Sample labels"], ["样品包装", "Sample packing"], ["留存分配", "Retention split"]] },
  { code: "SM05", name: "测试服务", nameEn: "Testing", department: "品质部", hasPage: true, nodes: ["N03"], items: [["成分检测", "Fiber content"], ["色牢度", "Color fastness"], ["起毛起球", "Pilling"], ["功能性检测", "Functional test"], ["pH 值", "pH"], ["布片色牢度", "Fabric fastness"], ["圆率测试", "Roundness test"], ["报告复用管理", "Report reuse", ["G1.testReportValid", "G2.reportsValid"]]] },
  { code: "SM06", name: "验货服务", nameEn: "Inspection", department: "品质部", hasPage: true, nodes: ["N09"], items: [["初期验货 IPI", "IPI"], ["中期验货 DPI", "DPI"], ["尾期验货 FRI", "FRI", ["G2.finalPassed"]], ["终验与放行确认", "Final release"]] },
  { code: "SM07", name: "包装服务", nameEn: "Packing", department: "生产部", hasPage: true, nodes: ["N07"], items: [["平铺装箱", "Flat packing"], ["条码与贴标", "Barcodes & labels"], ["包装方案确认", "Packing plan confirmation", ["G2.packingReady"]], ["包装通知单", "Packing notice"], ["船样确认", "Shipment sample"], ["腰封", "Belly band"]] },
  { code: "SM08", name: "订单与生产", nameEn: "Orders & production", department: "计划部", hasPage: true, nodes: ["N06", "N08"], items: [["订单接收", "Order intake"], ["排产计划", "Scheduling"], ["生产跟进", "Production follow-up"], ["交期变更", "Due date change"], ["订单类型处理", "Order type handling"], ["订单变更登记", "Order change log"], ["PO 与 BD 一致性核对", "PO vs BD check"]] },
  { code: "SM09", name: "采购与备料", nameEn: "Procurement & materials", department: "采购部", hasPage: true, nodes: ["N07", "N08"], items: [["纱线采购", "Yarn purchasing"], ["辅料采购", "Trim purchasing"], ["客供料接收", "Customer-supplied materials"], ["备料登记", "Material prep"], ["辅料主数据维护", "Trim master data"], ["RWS 贴纸核批", "RWS sticker approval"]] },
  { code: "SM10", name: "出货与单证", nameEn: "Shipping & documents", department: "关务部", hasPage: true, nodes: ["N10"], items: [["订舱", "Booking"], ["装箱进仓", "Warehouse delivery"], ["报关资料", "Export declaration"], ["清关资料", "Import clearance"], ["产地证", "Certificate of origin"], ["装船通知", "Shipping advice"], ["出货明细", "Shipment details"], ["Packing List", "Packing list"], ["箱唛管理", "Shipping marks"], ["发票制作", "Invoicing"], ["装柜与拼箱", "Container loading"], ["提单", "Bill of lading"], ["MU 与 BC 品报告", "MU & BC reports"]] },
  { code: "SM11", name: "结算与对账", nameEn: "Settlement", department: "财务部", hasPage: true, nodes: ["N10"], items: [["对账", "Reconciliation"], ["开票", "Invoicing"], ["收款核销", "Receipt matching"], ["账期结算", "Term settlement"], ["多渠道对价", "Channel pricing"], ["Open Payment 跟踪", "Open payment tracking"], ["包装成本多退少补", "Packing cost true-up"]] },
  { code: "SM12", name: "数据同步", nameEn: "Data sync", department: "业务部", hasPage: true, nodes: [], items: [["订单同步", "Order sync"], ["款式资料同步", "Style sync"], ["库存同步", "Inventory sync"], ["客户系统对接清单", "Customer system checklist"], ["测试报告回传", "Test report upload"], ["验货申请与报告回传", "Inspection upload"], ["TNA 同步", "TNA sync"]] },
  { code: "SM13", name: "TNA 与预警管理", nameEn: "TNA & alerts", department: "计划部", hasPage: false, nodes: [], items: [["TNA 模板", "TNA template"], ["关键节点计划", "Milestone plan"], ["节点预警", "Milestone alerts"], ["延误分析", "Delay analysis"], ["TNA 回传", "TNA upload"], ["TNA 变更", "TNA change"]] },
  { code: "SM14", name: "合规与证书", nameEn: "Compliance & certificates", department: "品质部", hasPage: false, nodes: [], items: [["社会责任审核", "Social audit"], ["环保认证", "Eco certificates"], ["RWS 认证", "RWS"], ["GRS 认证", "GRS"], ["OEKO-TEX", "OEKO-TEX"], ["化学品管控", "Chemical control"], ["证书到期提醒", "Certificate expiry"], ["客户合规清单", "Customer compliance checklist"]] },
  { code: "SM15", name: "会议与决策", nameEn: "Meetings & decisions", department: "业务部", hasPage: false, nodes: [], items: [["季度评审", "Quarterly review"], ["开发评审", "Development review"], ["订单评审", "Order review"], ["问题升级", "Escalation"], ["会议纪要", "Minutes"]] },
];

export const PATROL_RULES: { code: string; module: string; ruleType: string; name: string; nameEn: string; targetType: string; params: Record<string, number>; severity: string; assigneeRole: string }[] = [
  { code: "IR-001", module: "M03", ruleType: "ROUND_STUCK_ISSUED", name: "打样轮次超期未出样", nameEn: "Sample round not started", targetType: "sampleRound", params: { thresholdDays: 7 }, severity: "HIGH", assigneeRole: "R001" },
  { code: "IR-002", module: "M03", ruleType: "ROUND_AWAITING_APPROVAL", name: "客户批复等待超期", nameEn: "Customer approval overdue", targetType: "sampleRound", params: { thresholdDays: 5 }, severity: "MEDIUM", assigneeRole: "R001" },
  { code: "IR-003", module: "M06", ruleType: "TEST_OVERDUE", name: "送测超期未出报告", nameEn: "Test report overdue", targetType: "testRequest", params: { thresholdDays: 0 }, severity: "HIGH", assigneeRole: "R005" },
  { code: "IR-004", module: "M13", ruleType: "PURCHASE_OVERDUE", name: "采购逾期未到货", nameEn: "Purchase overdue", targetType: "purchase", params: { thresholdDays: 0 }, severity: "HIGH", assigneeRole: "R007" },
  { code: "IR-005", module: "M02", ruleType: "PLANNING_RECOGNIZING_STUCK", name: "企划识别超时", nameEn: "Brief recognition stuck", targetType: "planning", params: { thresholdDays: 1 }, severity: "LOW", assigneeRole: "R001" },
  { code: "IR-006", module: "M02", ruleType: "PLANNING_UNCONFIRMED", name: "企划确认超期", nameEn: "Brief not confirmed", targetType: "planning", params: { thresholdDays: 3 }, severity: "MEDIUM", assigneeRole: "R001" },
  { code: "IR-007", module: "M04", ruleType: "QUOTE_NO_FEEDBACK", name: "报价超期未反馈", nameEn: "Quote awaiting feedback", targetType: "quoteRound", params: { thresholdDays: 14 }, severity: "MEDIUM", assigneeRole: "R001" },
  { code: "IR-008", module: "M06", ruleType: "REPORT_EXPIRING", name: "测试报告即将过期", nameEn: "Test report expiring", targetType: "testReport", params: { thresholdDays: 30 }, severity: "MEDIUM", assigneeRole: "R005" },
  { code: "IR-009", module: "M09", ruleType: "PO_REVIEW_OVERDUE", name: "PO 待复核超期", nameEn: "PO review overdue", targetType: "order", params: { thresholdDays: 3 }, severity: "HIGH", assigneeRole: "R001" },
  { code: "IR-010", module: "M09", ruleType: "FACTORY_REPLY_MISSING", name: "工厂交期回复缺失", nameEn: "Factory reply missing", targetType: "order", params: { thresholdDays: 3 }, severity: "MEDIUM", assigneeRole: "R010" },
  { code: "IR-011", module: "M07", ruleType: "PACKING_UNCONFIRMED_NEAR_INSPECTION", name: "包装方案未确认临近验货", nameEn: "Packing unconfirmed near inspection", targetType: "packagingPlan", params: { thresholdDays: 7 }, severity: "HIGH", assigneeRole: "R001" },
  { code: "IR-012", module: "M10", ruleType: "INSPECTION_PRECONDITION_MISSING", name: "验货前置条件缺失", nameEn: "Inspection preconditions missing", targetType: "inspection", params: { thresholdDays: 3 }, severity: "HIGH", assigneeRole: "R005" },
  { code: "IR-013", module: "M10", ruleType: "FRI_FAILED_NO_REWORK", name: "尾验不合格未复验", nameEn: "Failed FRI not re-inspected", targetType: "inspection", params: { thresholdDays: 2 }, severity: "HIGH", assigneeRole: "R005" },
  { code: "IR-014", module: "M10", ruleType: "INSPECTION_LATE_SCHEDULE", name: "验货排期晚于交期前 15 天", nameEn: "Inspection scheduled too late", targetType: "inspection", params: { thresholdDays: 15 }, severity: "MEDIUM", assigneeRole: "R006" },
  { code: "IR-015", module: "M11", ruleType: "ETD_PASSED_NOT_SAILED", name: "订舱船期已过未开船", nameEn: "ETD passed, not sailed", targetType: "shipment", params: { thresholdDays: 0 }, severity: "HIGH", assigneeRole: "R008" },
  { code: "IR-016", module: "M11", ruleType: "ARRIVED_NOT_SIGNED", name: "到港未签收超期", nameEn: "Arrived, not signed", targetType: "shipment", params: { thresholdDays: 7 }, severity: "MEDIUM", assigneeRole: "R008" },
  { code: "IR-017", module: "M08", ruleType: "LEDGER_OVERDUE", name: "台账更新逾期", nameEn: "Ledger update overdue", targetType: "ledgerTask", params: { thresholdDays: 0 }, severity: "MEDIUM", assigneeRole: "R006" },
  { code: "IR-018", module: "M15", ruleType: "HANDOVER_INCOMPLETE", name: "开发移交缺项", nameEn: "Handover incomplete", targetType: "handover", params: { thresholdDays: 7 }, severity: "MEDIUM", assigneeRole: "R001" },
];

const DICTIONARIES: [string, string, string, string][] = [
  ["category", "KIDS", "童袜", "Kids"],
  ["category", "WOMEN", "女袜", "Women"],
  ["category", "MEN", "男袜", "Men"],
  ["subCategory", "CREW", "Crew（中筒）", "Crew"],
  ["subCategory", "NO_SHOW", "No Show（隐形）", "No show"],
  ["subCategory", "ANKLE", "Ankle（短筒）", "Ankle"],
  ["subCategory", "QUARTER", "Quarter（船袜）", "Quarter"],
  ["subCategory", "HALF_CALF", "Half Calf（半筒）", "Half calf"],
  ["roundType", "PROTO", "PROTO 原型样", "Proto"],
  ["roundType", "SMS", "SMS 销售样", "SMS"],
  ["roundType", "PP", "PP 产前样", "PP"],
  ["roundType", "COLOR", "颜色样", "Color"],
  ["roundType", "LAB_DIP", "Lab Dip 色样", "Lab dip"],
  ["roundType", "FIT", "试穿样", "Fit"],
  ["roundType", "PHOTO", "照片样", "Photo"],
  ["transportMode", "OCEAN", "海运", "Ocean"],
  ["transportMode", "AIR", "空运", "Air"],
  ["transportMode", "RAIL", "中欧班列", "Rail"],
  ["transportMode", "EXPRESS", "快递", "Express"],
  ["receivableType", "GOODS", "货款", "Goods"],
  ["receivableType", "DEDUCTION", "折让与质量扣款", "Deduction"],
  ["receivableType", "FREIGHT", "运输及相关费用", "Freight"],
  ["receivableType", "TESTING", "检测费", "Testing fee"],
  ["receivableType", "TRIMS", "辅料及包材费", "Trims & packing"],
  ["receivableType", "SAMPLE", "样品费", "Sample fee"],
  ["collectionChannel", "EMAIL", "邮件", "Email"],
  ["collectionChannel", "PHONE", "电话", "Phone"],
  ["collectionChannel", "WECHAT", "微信", "WeChat"],
  ["collectionChannel", "CUSTOMER_SYSTEM", "客户系统", "Customer system"],
  ["testItem", "FIBER", "成分检测", "Fiber content"],
  ["testItem", "COLORFAST", "色牢度", "Color fastness"],
  ["testItem", "PILLING", "起毛起球", "Pilling"],
  ["testItem", "FUNCTIONAL", "功能性检测", "Functional"],
  ["testItem", "PH", "pH 值", "pH"],
  ["testItem", "SAFETY", "安全 / 毒性", "Safety"],
  ["testItem", "YARN", "纱线测试", "Yarn test"],
];

export async function seedReference(db: Database): Promise<{ users: Record<string, string>; customers: Record<string, string>; orgs: Record<string, string>; roles: Record<string, string> }> {
  const passwordHash = await hash(DEMO_PASSWORD);
  const orgIds: Record<string, string> = {};
  for (const [i, o] of ORG_TREE.entries()) {
    const idv = uuidv7();
    orgIds[o.code] = idv;
    const parentPath = o.parent ? (await pathOf(o.parent)) : "/";
    await db.insert(t.orgs).values({ id: idv, code: o.code, name: o.name, nameEn: o.nameEn, type: o.type, function: o.fn, parentId: o.parent ? orgIds[o.parent]! : null, path: `${parentPath}${idv}/`, sort: i });
  }
  async function pathOf(code: string): Promise<string> {
    const parent = ORG_TREE.find((o) => o.code === code)!;
    const chain: string[] = [];
    let cur: (typeof ORG_TREE)[number] | undefined = parent;
    while (cur) {
      chain.unshift(orgIds[cur.code]!);
      cur = cur.parent ? ORG_TREE.find((o) => o.code === cur!.parent) : undefined;
    }
    return `/${chain.join("/")}/`;
  }

  const customerIds: Record<string, string> = {};
  for (const c of DEMO_CUSTOMERS) {
    const idv = uuidv7();
    customerIds[c.code] = idv;
    await db.insert(t.customers).values({ id: idv, code: c.code, name: c.name, nameEn: c.nameEn, logoText: c.nameEn.toUpperCase(), paymentTermsDays: c.terms, currency: c.currency, settlementEntity: c.entity, contactName: `${c.nameEn} Buyer`, ownerOrgId: orgIds.ORG002 });
  }

  const roleIds: Record<string, string> = {};
  for (const r of PRESET_ROLES) {
    const idv = uuidv7();
    roleIds[r.code] = idv;
    await db.insert(t.roles).values({ id: idv, code: r.code, name: r.label.zh, nameEn: r.label.en, type: r.type, dataScope: r.dataScope, allCustomers: r.allCustomers });
    const perms = expandPermissionPatterns(PERMISSION_PRESETS[r.permissionPreset]);
    await db.insert(t.rolePermissions).values(perms.map((p) => ({ roleId: idv, permission: p })));
    if (!r.allCustomers) {
      await db.insert(t.roleCustomers).values(SALES_REP_CUSTOMERS.map((c) => ({ roleId: idv, customerId: customerIds[c]! })));
    }
  }

  const userIds: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    const idv = uuidv7();
    userIds[u.phone] = idv;
    await db.insert(t.users).values({ id: idv, phone: u.phone, name: u.name, nameEn: u.nameEn, email: u.email, passwordHash, primaryOrgId: orgIds[u.org]! });
    await db.insert(t.userRoles).values({ userId: idv, roleId: roleIds[u.role]! });
  }
  const leaders: [string, string][] = [["ORG001", "13800000003"], ["ORG002", "13800000002"], ["ORG014", "13800000000"]];
  for (const [org, phone] of leaders) {
    await db.update(t.orgs).set({ leaderId: userIds[phone]! }).where(eqId(t.orgs.id, orgIds[org]!));
  }

  const baseIds: Record<string, string> = {};
  for (const b of BASES) {
    const idv = uuidv7();
    baseIds[b.code] = idv;
    await db.insert(t.bases).values({ id: idv, code: b.code, name: b.name, nameEn: b.nameEn, country: b.country });
    for (const [code, name] of b.factories) {
      await db.insert(t.factories).values({ code, name, baseId: idv, legalEntity: b.country === "VN" ? "OTD Knitting Vietnam Co." : `OTD 针织${name}` });
    }
  }
  const needleIds: Record<string, string> = {};
  for (const [code, needles] of NEEDLES) {
    const idv = uuidv7();
    needleIds[code] = idv;
    await db.insert(t.needleTypes).values({ id: idv, code, needles });
  }
  const machines: [string, string, number, number][] = [
    ["DC", "96N", 184, 174.6], ["DC", "120N", 253, 192.8], ["DC", "144N", 276, 188.5], ["DC", "200N", 143, 154.6],
    ["VN", "96N", 141, 133.7], ["VN", "120N", 184, 155.6], ["VN", "144N", 209, 141.8], ["VN", "200N", 106, 122.2],
    ["NH", "96N", 92, 175.9], ["NH", "120N", 127, 202.1], ["NH", "144N", 140, 185.1],
  ];
  for (const [base, needle, count, daily] of machines) {
    await db.insert(t.baseMachines).values({ baseId: baseIds[base]!, needleTypeId: needleIds[needle]!, machineCount: count, dailyOutputPerMachine: daily });
  }

  await db.insert(t.testAgencies).values([
    { code: "BV-GZ", name: "BV 广州", city: "广州" },
    { code: "BV-SX", name: "BV 绍兴", city: "绍兴" },
    { code: "SGS-HZ", name: "SGS 杭州", city: "杭州" },
    { code: "SGS-NB", name: "SGS 宁波", city: "宁波" },
    { code: "ITS-SH", name: "ITS 上海", city: "上海" },
    { code: "QUALSPEC", name: "Qualspec", city: "上海" },
  ]);
  await db.insert(t.forwarders).values([
    { code: "NFI", name: "NFI 物流", type: "FORWARDER" },
    { code: "KWE", name: "近铁国际", type: "FORWARDER" },
    { code: "EMC", name: "长荣海运", type: "CARRIER" },
    { code: "COSCO", name: "中远海运", type: "CARRIER" },
    { code: "CRE", name: "中欧班列", type: "CARRIER" },
  ]);
  await db.insert(t.materials).values([
    { code: "Y-40S-T80C20", name: "40S/1*2 T80C20 纱线", category: "YARN", spec: "40S/1*2", unit: "kg", unitPrice: 42.5, supplier: "华茂纱业" },
    { code: "Y-COMBED-32S", name: "32S 精梳棉", category: "YARN", spec: "32S", unit: "kg", unitPrice: 38, supplier: "华茂纱业" },
    { code: "Y-NYLON-70D", name: "70D 锦纶包覆纱", category: "YARN", spec: "70D", unit: "kg", unitPrice: 56, supplier: "恒力化纤" },
    { code: "Y-SPANDEX-1207070", name: "橡筋 1207070", category: "YARN", spec: "1207070", unit: "kg", unitPrice: 88, supplier: "恒力化纤" },
    { code: "T-SILICONE", name: "硅胶防滑点", category: "TRIM", spec: "踵部", unit: "双", unitPrice: 0.12, supplier: "联达辅料" },
    { code: "P-OPP-BAG", name: "OPP 自立袋", category: "PACKAGING", spec: "0.06mm", unit: "个", unitPrice: 0.08, supplier: "宏达包装" },
    { code: "P-CARTON-C", name: "C 型单层瓦楞纸箱", category: "PACKAGING", spec: "56×42×38", unit: "个", unitPrice: 6.5, supplier: "宏达包装" },
    { code: "P-HANGTAG", name: "吊卡", category: "PACKAGING", spec: "铜版纸 350g", unit: "个", unitPrice: 0.15, supplier: "宏达包装" },
  ]);
  await db.insert(t.dictionaries).values(DICTIONARIES.map(([type, code, zh, en], i) => ({ type, code, label: { zh, en }, sort: i })));
  await db.insert(t.exchangeRates).values([
    { currency: "USD", rateToCny: 7.1, effectiveDate: "2026-10-01" },
    { currency: "EUR", rateToCny: 7.75, effectiveDate: "2026-10-01" },
    { currency: "JPY", rateToCny: 0.048, effectiveDate: "2026-10-01" },
    { currency: "GBP", rateToCny: 9.05, effectiveDate: "2026-10-01" },
    { currency: "HKD", rateToCny: 0.91, effectiveDate: "2026-10-01" },
    { currency: "CNY", rateToCny: 1, effectiveDate: "2026-10-01" },
  ]);
  for (const code of ["SS26", "AW26", "HO26", "SP27", "FA27", "HO27"]) {
    const map: Record<string, [string, string]> = { SS: ["春夏", "Spring/Summer"], AW: ["秋冬", "Autumn/Winter"], HO: ["假日", "Holiday"], SP: ["春季", "Spring"], FA: ["秋季", "Fall"] };
    const [zh, en] = map[code.slice(0, 2)]!;
    await db.insert(t.seasons).values({ code, label: { zh: `20${code.slice(2)} ${zh}`, en: `${en} 20${code.slice(2)}` } });
  }

  for (const [i, m] of SERVICE_CATALOG.entries()) {
    const moduleId = uuidv7();
    await db.insert(t.serviceModules).values({ id: moduleId, code: m.code, name: m.name, nameEn: m.nameEn, department: m.department, sort: i + 1, hasPage: m.hasPage });
    await db.insert(t.serviceItems).values(
      m.items.map(([name, nameEn, gates], j) => ({
        moduleId,
        code: `${m.code}-${String(j + 1).padStart(2, "0")}`,
        name,
        nameEn,
        sort: j + 1,
        effects: { nodes: m.nodes, gateConditions: gates ?? [] },
      })),
    );
  }

  await db.insert(t.quoteStrategies).values([
    { code: "PS-001", name: "标准报价", nameEn: "Standard", method: "MARKUP", lossRate: 0.2, overheadRate: 0, markupRate: 0.2, targetMargin: 0.18, guardrail: 0.12, lockedFx: 6.72, moq: 2000, smallOrderUplift: 0.5, skuTiers: [] },
    { code: "PS-002", name: "大单进取 · 让利换量", nameEn: "Volume push", method: "MARGIN", lossRate: 0.2, overheadRate: 0, markupRate: 0.2, targetMargin: 0.18, guardrail: 0.12, lockedFx: 6.72, moq: 10000, smallOrderUplift: 0.5, skuTiers: [{ minAmount: 500000, discount: 0.01 }, { minAmount: 1000000, discount: 0.02 }, { minAmount: 3000000, discount: 0.04 }, { minAmount: 5000000, discount: 0.05 }] },
    { code: "PS-003", name: "新客开拓", nameEn: "New customer", method: "MARGIN", lossRate: 0.2, overheadRate: 0.02, markupRate: 0.15, targetMargin: 0.15, guardrail: 0.1, lockedFx: 6.72, moq: 5000, smallOrderUplift: 0.3, skuTiers: [] },
  ]);

  await db.insert(t.patrolRules).values(PATROL_RULES.map((r) => ({ ...r, yellowWindowDays: 2 })));

  await db.insert(t.ledgerTasks).values([
    { ledger: "KNIT", name: "编织产能空余量表", frequency: "WEEKLY", ownerId: userIds["13800000008"]!, currentVersion: "V26", nextDueAt: "2026-10-27", status: "PENDING" },
    { ledger: "PACKING", name: "包装订单情况表", frequency: "MONTHLY", ownerId: userIds["13800000008"]!, currentVersion: "V26", nextDueAt: "2026-11-18", status: "DONE" },
    { ledger: "SPECIAL", name: "刺绣等特殊工序产能表", frequency: "MONTHLY", ownerId: userIds["13800000012"]!, currentVersion: "V26", nextDueAt: "2026-10-19", status: "OVERDUE" },
    { ledger: "UTILIZATION", name: "基地开机率统计表", frequency: "WEEKLY", ownerId: userIds["13800000008"]!, currentVersion: "V26", nextDueAt: "2026-10-27", status: "PENDING" },
    { ledger: "FORECAST", name: "集团订单预测表", frequency: "ROLLING_MONTHLY", ownerId: userIds["13800000003"]!, currentVersion: "滚动版 5", nextDueAt: "2026-10-29", status: "UPDATING" },
  ]);

  await db.insert(t.systemParams).values([
    { key: "patrol.schedule", value: { fullAt: "00:50", intervalHours: 2, workStart: "08:00", workEnd: "20:00" }, description: "巡检调度" },
    { key: "testing.expiringDays", value: 30, description: "报告即将过期提前天数" },
    { key: "inspection.releaseDaysBeforeExFactory", value: 15, description: "终验须在工厂交期前完成的天数" },
    { key: "inspection.dailyLimitPerFactory", value: 5, description: "同厂同日验货款数上限" },
    { key: "ai.dailyQuotaPerUser", value: 200, description: "每人每日 AI 调用上限" },
    { key: "assistant.name", value: { zh: "OTD 助手", en: "OTD Assistant" }, description: "助手名称" },
    { key: "todo.dueSoonHours", value: 24, description: "今日到期判定" },
  ]);

  await db.insert(t.numberSequences).values([
    { prefix: "ORG", period: "", current: ORG_TREE.length },
    { prefix: "R", period: "", current: 90 },
    { prefix: "IR", period: "", current: PATROL_RULES.length },
    { prefix: "PS", period: "", current: 3 },
  ]);

  return { users: userIds, customers: customerIds, orgs: orgIds, roles: roleIds };
}

import { eq } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

function eqId(col: PgColumn, value: string) {
  return eq(col, value);
}
