import { useStore, billBalance } from "./store";
import { fmtYER, fmtNum } from "./pricing";

export type AiResponse =
  | { kind: "text"; text: string; suggestions?: string[] }
  | { kind: "suggestions"; text: string; suggestions: string[] }
  | {
      kind: "subscriber_ledger";
      customer: { id: number; name: string; phone: string; pay_account: string; directorate?: string };
      totals: { paid: number; arrears: number; billed: number };
      series: Array<{ label: string; consumption: number; amount: number }>;
    }
  | {
      kind: "loss_analysis";
      range: { from: string; to: string };
      water: { produced: number; consumed: number; loss: number; pct: number };
      electric: { produced: number; consumed: number; loss: number; pct: number };
      alerts: string[];
    }
  | {
      kind: "payment_status";
      paid: Array<{ id: number; name: string; serial: string; total: number }>;
      unpaid: Array<{ id: number; name: string; serial: string; total: number; balance: number }>;
    }
  | {
      kind: "revenue_report";
      range: { from: string; to: string; label: string };
      totals: { cash: number; bank: number; total: number; count: number; avg: number };
      series: Array<{ day: string; cash: number; bank: number; total: number }>;
    };

function todayRange() {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return { start, end: start + 86400000, label: "اليوم" };
}
function monthRange() {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  return { start, end, label: "هذا الشهر" };
}
function weekRange() {
  const now = new Date();
  const start = now.getTime() - 7 * 86400000;
  return { start, end: now.getTime(), label: "آخر 7 أيام" };
}
function iso(t: number) { return new Date(t).toISOString().slice(0, 10); }

function findCustomer(q: string) {
  const s = useStore.getState();
  const clean = q.trim().toLowerCase();
  // Match by meter number (e.g. "MSR-0004") — cross-reference the meters array.
  const meterMatch = s.meters.find((m) => m.number.toLowerCase() === clean);
  if (meterMatch) {
    const c = s.customers.find((x) => x.id === meterMatch.customer_id);
    if (c) return c;
  }
  // Match by meter number anywhere in the query string.
  const meterInText = s.meters.find((m) => clean.includes(m.number.toLowerCase()));
  if (meterInText) {
    const c = s.customers.find((x) => x.id === meterInText.customer_id);
    if (c) return c;
  }
  return s.customers.find((c) =>
    c.name.toLowerCase().includes(clean) ||
    c.phone.includes(clean) ||
    String(c.id) === clean,
  );
}

export function answerQuestion(q: string): AiResponse {
  const s = useStore.getState();
  const text = q.trim();
  const has = (...kws: string[]) => kws.some((k) => text.includes(k));

  // 0) Summary stats — subscriber count, total debt, top defaulters, production
  if (has("عدد المشترك", "كم عدد", "كم المشترك", "عدد المشتركين")) {
    const count = s.counts.customers || s.customers.length;
    const active = s.customers.filter((c) => c.status === "active").length;
    return {
      kind: "text",
      text: `عدد المشتركين الإجمالي: ${fmtNum(count)} مشترك، منهم ${fmtNum(active)} نشط.`,
      suggestions: ["كم إجمالي الديون؟", "ما أكثر المشتركين تأخراً؟", "كم تم تحصيله هذا الشهر؟"],
    };
  }

  if (has("إجمالي الديون", "إجمالي الدين", "كم الدين", "كل الديون", "مجموع الديون", "إجمالي المتأخرات")) {
    const totalDebt = s.customers.reduce((a, c) => a + (c.balance ?? 0), 0);
    const debtors = s.customers.filter((c) => (c.balance ?? 0) > 0).length;
    return {
      kind: "text",
      text: `إجمالي الديون المستحقة: ${fmtYER(totalDebt)} على ${fmtNum(debtors)} مشترك.`,
      suggestions: ["ما أكثر المشتركين تأخراً؟", "كم عدد المشتركين؟", "كم تم تحصيله هذا الشهر؟"],
    };
  }

  if (has("أكثر المشتركين تأخر", "الأكثر تأخراً", "الأكثر ديناً", "أكثر المديونين", "أكبر الديون", "أعلى الديون")) {
    const top = [...s.customers]
      .filter((c) => (c.balance ?? 0) > 0)
      .sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))
      .slice(0, 10);
    if (top.length === 0) {
      return { kind: "text", text: "لا توجد متأخرات حالياً — جميع المشتركين سددوا مستحقاتهم." };
    }
    const lines = top.map((c, i) => {
      const m = s.meters.find((x) => x.customer_id === c.id);
      return `${i + 1}. ${c.name}${m ? ` (${m.number})` : ""} — ${fmtYER(c.balance ?? 0)}`;
    });
    return {
      kind: "text",
      text: `أكثر المشتركين تأخراً بالسداد:\n${lines.join("\n")}`,
      suggestions: ["كم إجمالي الديون؟", "استعلام عن التحصيل اليوم"],
    };
  }

  if (has("إنتاج المياه", "كم إنتاج", "إنتاج اليوم", "كم أنتج", "كم الإنتاج", "كم الضخ", "حجم الإنتاج")) {
    const range = has("اليوم") ? todayRange() : has("أسبوع", "اسبوع") ? weekRange() : monthRange();
    const produced = s.productionLogs
      .filter((p) => p.type === "water" && +new Date(p.date) >= range.start && +new Date(p.date) < range.end)
      .reduce((a, b) => a + b.units, 0);
    const consumed = s.readings
      .filter((r) => r.status !== "rejected" && +new Date(r.date) >= range.start && +new Date(r.date) < range.end)
      .reduce((a, b) => a + Math.max(0, b.consumption), 0);
    const loss = Math.max(0, produced - consumed);
    const pct = produced > 0 ? (loss / produced) * 100 : 0;
    return {
      kind: "text",
      text: `إنتاج المياه ${range.label}: ${fmtNum(Math.round(produced))} م³\nالاستهلاك المُفوتر: ${fmtNum(Math.round(consumed))} م³\nالفاقد: ${fmtNum(Math.round(loss))} م³ (${pct.toFixed(1)}%)`,
      suggestions: ["تحليل الفاقد لهذا الشهر", "كم عدد المشتركين؟", "كم تم تحصيله هذا الشهر؟"],
    };
  }

  // 1) Subscriber ledger
  if (has("استعلام عن مشترك", "مشترك", "حساب", "كشف حساب", "ذمة", "رصيد", "فواتير المشترك", "اعرض فواتير")) {
    // Try to extract a meter number (MSR-XXXX) from the question first.
    const meterMatch = text.match(/MSR-\d{3,5}/i);
    let target = meterMatch ? findCustomer(meterMatch[0]) : undefined;
    if (!target) {
      // Try to extract a name/phone after keyword
      const m = text.match(/(?:عن\s+مشترك|مشترك|حساب)\s+(.+?)(?:$|[?؟])/);
      target = m ? findCustomer(m[1]) : undefined;
    }
    if (!target) {
      // Look for any customer name inside
      target = s.customers.find((c) => text.includes(c.name.split(/\s+/)[0]));
    }
    if (!target) {
      return {
        kind: "suggestions",
        text: "حدد المشترك — يمكنك اختيار أحد المشتركين النشطين:",
        suggestions: s.customers.slice(0, 6).map((c) => `استعلام عن مشترك ${c.name}`),
      };
    }
    const customerBills = s.bills.filter((b) => b.customer_id === target!.id).sort((a, b) => +new Date(a.date) - +new Date(b.date));
    const paid = s.payments
      .filter((p) => p.status === "approved" && customerBills.some((b) => b.id === p.bill_id))
      .reduce((a, p) => a + p.amount, 0);
    // المديونية من رصيد قاعدة البيانات عند توفره، وإلا تُحسب من صفوف الفواتير المزامَنة.
    const arrears = target!.balance !== undefined
      ? target!.balance
      : customerBills.reduce((a, b) => a + billBalance(b, s.payments), 0);

    const billed = customerBills.reduce((a, b) => a + b.total, 0);
    const series = customerBills.slice(-6).map((b) => {
      const r = s.readings.find((x) => x.id === b.reading_id);
      return {
        label: new Date(b.date).toLocaleDateString("ar-EG", { month: "short" }),
        consumption: r?.consumption ?? 0,
        amount: b.total,
      };
    });
    return {
      kind: "subscriber_ledger",
      customer: { id: target.id, name: target.name, phone: target.phone, pay_account: target.pay_account, directorate: target.directorate },
      totals: { paid, arrears, billed },
      series,
    };
  }

  // 2) Loss analysis
  if (has("فاقد", "تسرب", "خسائر", "تحليل الفاقد")) {
    const range = has("اليوم") ? todayRange() : has("أسبوع", "اسبوع") ? weekRange() : monthRange();
    const perType = (t: "water" | "electric") => {
      const produced = s.productionLogs
        .filter((p) => p.type === t && +new Date(p.date) >= range.start && +new Date(p.date) < range.end)
        .reduce((a, b) => a + b.units, 0);
      const meterIds = new Set(s.meters.filter((m) => m.type === t).map((m) => m.id));
      const consumed = s.readings
        .filter((r) => meterIds.has(r.meter_id) && r.status !== "rejected" && +new Date(r.date) >= range.start && +new Date(r.date) < range.end)
        .reduce((a, b) => a + b.consumption, 0);
      const loss = Math.max(0, produced - consumed);
      const pct = produced > 0 ? (loss / produced) * 100 : 0;
      return { produced, consumed, loss, pct };
    };
    const water = perType("water");
    const electric = perType("electric");
    const alerts: string[] = [];
    if (water.pct > 15) alerts.push(`فاقد المياه ${water.pct.toFixed(1)}% — يُوصى بجولات تفتيش للتسريبات وفحص التوصيلات غير المشروعة في الشبكات عالية الاستهلاك`);
    if (electric.pct > 15) alerts.push(`فاقد الكهرباء ${electric.pct.toFixed(1)}% — يُوصى بمسح ميداني للتوصيلات المخالفة ومعايرة العدادات`);
    return {
      kind: "loss_analysis",
      range: { from: iso(range.start), to: iso(range.end - 1) },
      water, electric, alerts,
    };
  }

  // 3) Payment status
  if (has("من دفع", "من لم يدفع", "المدفوع", "غير المدفوع", "المتأخرين", "متأخر", "حالة الدفع")) {
    const paid = s.bills.filter((b) => b.status === "paid").slice(0, 50).map((b) => {
      const c = s.customers.find((x) => x.id === b.customer_id);
      return { id: b.id, name: c?.name ?? "—", serial: b.serial, total: b.total };
    });
    const unpaid = s.bills.filter((b) => b.status !== "paid").slice(0, 50).map((b) => {
      const c = s.customers.find((x) => x.id === b.customer_id);
      return { id: b.id, name: c?.name ?? "—", serial: b.serial, total: b.total, balance: billBalance(b, s.payments) };
    });
    return { kind: "payment_status", paid, unpaid };
  }

  // 4) Revenue report
  if (has("تحصيل", "محصل", "ايراد", "إيراد", "دخل")) {
    const range = has("اليوم") ? todayRange() : has("أسبوع", "اسبوع") ? weekRange() : monthRange();
    const payments = s.payments.filter((p) => p.status === "approved" && +new Date(p.date) >= range.start && +new Date(p.date) < range.end);
    const cash = payments.filter((p) => p.method === "cash").reduce((a, b) => a + b.amount, 0);
    const bank = payments.filter((p) => p.method === "wallet").reduce((a, b) => a + b.amount, 0);
    const total = cash + bank;
    const days = new Map<string, { cash: number; bank: number; total: number }>();
    payments.forEach((p) => {
      const d = iso(+new Date(p.date));
      const cur = days.get(d) ?? { cash: 0, bank: 0, total: 0 };
      if (p.method === "cash") cur.cash += p.amount; else if (p.method === "wallet") cur.bank += p.amount;
      cur.total += p.amount;
      days.set(d, cur);
    });
    const series = [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day: day.slice(5), ...v }));
    return {
      kind: "revenue_report",
      range: { from: iso(range.start), to: iso(range.end - 1), label: range.label },
      totals: { cash, bank, total, count: payments.length, avg: payments.length ? total / payments.length : 0 },
      series,
    };
  }

  // Fallback: intent suggestions
  return {
    kind: "suggestions",
    text: "اختر استعلاماً — ميزان الذكي يدعم أربعة تقارير رئيسية:",
    suggestions: [
      "استعلام عن مشترك",
      "تحليل الفاقد لهذا الشهر",
      "من دفع ومن لم يدفع؟",
      "استعلام عن التحصيل اليوم",
    ],
  };
}

// keep helpers referenced (for compatibility)
export { fmtYER, fmtNum };
