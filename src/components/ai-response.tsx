import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AiResponse } from "@/lib/ai-intent";
import { fmtYER, fmtNum } from "@/lib/pricing";
import { AlertTriangle, CheckCircle2, XCircle, Droplets, Zap, TrendingUp, Wallet, Smartphone, CircleDollarSign, User, Phone, MapPin, Download, Printer, Droplet, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { MizanAiIcon } from "@/components/mizan-ai-icon";

interface Props {
  response: AiResponse;
  onSuggestion: (q: string) => void;
}

export function AiResponseRenderer({ response, onSuggestion }: Props) {
  if (response.kind === "text" || response.kind === "suggestions") {
    return (
      <div className="space-y-2 text-sm whitespace-pre-wrap">
        <p>{response.text}</p>
        {response.suggestions && response.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {response.suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onSuggestion(s)}
                className="text-xs px-2.5 py-1 rounded-full border bg-background hover:bg-primary/10 hover:border-primary/40 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (response.kind === "subscriber_ledger") {
    const { customer, totals, series } = response;
    return (
      <Card className="border-primary/30">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-bold flex items-center gap-1.5"><User className="w-4 h-4 text-primary" /> {customer.name}</div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> <span dir="ltr">{customer.phone}</span></span>
                {customer.directorate && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {customer.directorate}</span>}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mt-1" dir="ltr">{customer.pay_account}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatBox label="إجمالي مفوتر" value={fmtYER(totals.billed)} />
            <StatBox label="مدفوع" value={fmtYER(totals.paid)} tone="ok" />
            <StatBox label="متأخرات" value={fmtYER(totals.arrears)} tone={totals.arrears > 0 ? "danger" : undefined} />
          </div>
          {series.length > 0 && (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => fmtNum(v)} />
                  <Bar dataKey="consumption" name="استهلاك" fill="var(--water)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (response.kind === "account_statement") {
    return <AccountStatementCard response={response} onSuggestion={onSuggestion} />;
  }

  if (response.kind === "loss_analysis") {
    const chart = [
      { name: "مياه", produced: response.water.produced, consumed: response.water.consumed, loss: response.water.loss },
      { name: "كهرباء", produced: response.electric.produced, consumed: response.electric.consumed, loss: response.electric.loss },
    ];
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-xs text-muted-foreground">الفترة: {response.range.from} → {response.range.to}</div>
          <div className="grid grid-cols-2 gap-2">
            <LossCard label="فاقد المياه" pct={response.water.pct} loss={response.water.loss} icon={<Droplets className="w-4 h-4 text-water" />} />
            <LossCard label="فاقد الكهرباء" pct={response.electric.pct} loss={response.electric.loss} icon={<Zap className="w-4 h-4 text-electric" />} />
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmtNum(v)} />
                <Legend />
                <Bar dataKey="produced" name="مُنتج" fill="var(--water)" />
                <Bar dataKey="consumed" name="مُستهلَك" fill="var(--electric-2)" />
                <Bar dataKey="loss" name="فاقد" fill="#dc2626" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {response.alerts.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1">
              {response.alerts.map((a) => (
                <div key={a} className="flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (response.kind === "payment_status") {
    function exportCsv(rows: Array<Record<string, string | number>>, name: string) {
      if (typeof window === "undefined") return;
      const cols = Object.keys(rows[0] ?? {});
      const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(","))].join("\n");
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(url);
    }
    return (
      <div className="grid md:grid-cols-2 gap-3">
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="w-4 h-4" /> مدفوعة ({response.paid.length})</div>
              <Button size="sm" variant="ghost" onClick={() => exportCsv(response.paid, "paid")}><Download className="w-3 h-3 ms-1" /> CSV</Button>
            </div>
            <ul className="text-xs space-y-1 max-h-56 overflow-auto">
              {response.paid.map((p) => (
                <li key={p.id} className="flex justify-between border-b pb-1"><span className="font-mono text-[10px]">{p.serial}</span><span className="flex-1 mx-2 truncate">{p.name}</span><span className="font-semibold">{fmtYER(p.total)}</span></li>
              ))}
              {response.paid.length === 0 && <li className="text-muted-foreground text-center py-4">لا توجد</li>}
            </ul>
          </CardContent>
        </Card>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold flex items-center gap-1.5 text-destructive"><XCircle className="w-4 h-4" /> غير مدفوعة ({response.unpaid.length})</div>
              <Button size="sm" variant="ghost" onClick={() => exportCsv(response.unpaid, "unpaid")}><Download className="w-3 h-3 ms-1" /> CSV</Button>
            </div>
            <ul className="text-xs space-y-1 max-h-56 overflow-auto">
              {response.unpaid.map((p) => (
                <li key={p.id} className="flex justify-between border-b pb-1"><span className="font-mono text-[10px]">{p.serial}</span><span className="flex-1 mx-2 truncate">{p.name}</span><span className="font-semibold">{fmtYER(p.balance)}</span></li>
              ))}
              {response.unpaid.length === 0 && <li className="text-muted-foreground text-center py-4">لا توجد</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (response.kind === "revenue_report") {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-xs text-muted-foreground">{response.range.label}: {response.range.from} → {response.range.to}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatBox label="نقدي" value={fmtYER(response.totals.cash)} icon={<Wallet className="w-4 h-4 text-water" />} />
            <StatBox label="الكريمي" value={fmtYER(response.totals.bank)} icon={<Smartphone className="w-4 h-4 text-primary" />} />
            <StatBox label="الإجمالي" value={fmtYER(response.totals.total)} tone="ok" icon={<CircleDollarSign className="w-4 h-4 text-emerald-600" />} />
            <StatBox label="متوسط الدفعة" value={fmtYER(response.totals.avg)} icon={<TrendingUp className="w-4 h-4 text-muted-foreground" />} />
          </div>
          {response.series.length > 0 ? (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={response.series}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => fmtYER(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="cash" name="نقدي" stroke="var(--water)" />
                  <Line type="monotone" dataKey="bank" name="الكريمي" stroke="var(--electric-2)" />
                  <Line type="monotone" dataKey="total" name="الإجمالي" stroke="#059669" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-6">لا توجد دفعات معتمدة في هذه الفترة</p>
          )}
          <Badge variant="outline" className="text-[11px]">
            {response.totals.count} عملية معتمدة
          </Badge>
        </CardContent>
      </Card>
    );
  }

  return null;
}

function StatBox({ label, value, tone, icon }: { label: string; value: string; tone?: "ok" | "danger"; icon?: React.ReactNode }) {
  const cls = tone === "ok" ? "border-emerald-500/30 bg-emerald-500/5" : tone === "danger" ? "border-destructive/30 bg-destructive/5" : "bg-muted/30";
  return (
    <div className={`rounded-lg border p-2.5 ${cls}`}>
      <div className="text-[10px] text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className={`text-sm font-bold mt-1 ${tone === "danger" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

function LossCard({ label, pct, loss, icon }: { label: string; pct: number; loss: number; icon: React.ReactNode }) {
  const danger = pct > 15;
  return (
    <div className={`p-3 rounded-lg border ${danger ? "border-destructive/40 bg-destructive/5" : "bg-muted/30"}`}>
      <div className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className={`text-xl font-bold mt-1 ${danger ? "text-destructive" : ""}`}>{pct.toFixed(1)}%</div>
      <div className="text-[11px] text-muted-foreground">{fmtNum(loss)} وحدة فاقد</div>
    </div>
  );
}

// ─── Account Statement Card ──────────────────────────────────────────
function AccountStatementCard({
  response,
  onSuggestion,
}: {
  response: Extract<AiResponse, { kind: "account_statement" }>;
  onSuggestion: (q: string) => void;
}) {
  if (response.kind !== "account_statement") return null;
  const { customer, totals, lastReading, bills, payments } = response;

  const statusLabel = (s: string) =>
    s === "paid" ? "مدفوعة" : s === "partial" ? "جزئية" : "غير مدفوعة";
  const statusVariant = (s: string): "default" | "secondary" | "destructive" =>
    s === "paid" ? "default" : s === "partial" ? "secondary" : "destructive";
  const payStatusLabel = (s: string) =>
    s === "approved" ? "معتمدة" : s === "pending" ? "معلقة" : "مرفوضة";
  const payStatusVariant = (s: string): "default" | "secondary" | "destructive" =>
    s === "approved" ? "default" : s === "pending" ? "secondary" : "destructive";
  const methodLabel = (m: string) =>
    m === "cash" ? "نقدي" : m === "wallet" ? "الكريمي" : "تحويل";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <MizanAiIcon size={28} />
          <div>
            <h3 className="text-base font-bold">كشف حساب المشترك</h3>
            <p className="text-[11px] text-muted-foreground">{customer.name}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => exportStatementPDF(response)}>
          <Printer className="w-3.5 h-3.5 ms-1" /> طباعة كشف الحساب PDF
        </Button>
      </div>

      {/* Customer info */}
      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              <div>
                <div className="text-muted-foreground">الاسم</div>
                <div className="font-semibold">{customer.name}</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-muted-foreground" />
              <div>
                <div className="text-muted-foreground">العداد</div>
                <div className="font-mono font-semibold">{customer.meterNumber ?? "—"}</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-muted-foreground" />
              <div>
                <div className="text-muted-foreground">الهاتف</div>
                <div className="font-mono" dir="ltr">{customer.phone}</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-muted-foreground" />
              <div>
                <div className="text-muted-foreground">الحالة</div>
                <Badge variant={customer.status === "active" ? "default" : "destructive"} className="text-[10px]">
                  {customer.status === "active" ? "نشط" : "متوقف"}
                </Badge>
              </div>
            </div>
          </div>
          {customer.directorate && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" /> {customer.directorate}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatBox label="إجمالي الفواتير" value={fmtYER(totals.billed)} icon={<TrendingUp className="w-3 h-3" />} />
        <StatBox label="المدفوع" value={fmtYER(totals.paid)} tone="ok" icon={<CheckCircle2 className="w-3 h-3" />} />
        <StatBox label="المتأخرات" value={fmtYER(totals.arrears)} tone="danger" icon={<AlertTriangle className="w-3 h-3" />} />
        <StatBox label="الرصيد الحالي" value={fmtYER(totals.balance)} tone={totals.balance > 0 ? "danger" : "ok"} icon={<Wallet className="w-3 h-3" />} />
      </div>

      {/* Last reading */}
      {lastReading && (
        <Card>
          <CardContent className="p-3">
            <div className="text-xs font-semibold mb-2 flex items-center gap-1">
              <Droplet className="w-3.5 h-3.5 text-water" /> آخر قراءة
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">التاريخ</div>
                <div className="font-semibold">{new Date(lastReading.date).toLocaleDateString("ar-EG")}</div>
              </div>
              <div>
                <div className="text-muted-foreground">القراءة الحالية</div>
                <div className="font-semibold">{fmtNum(lastReading.current)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">الاستهلاك</div>
                <div className="font-semibold">{fmtNum(lastReading.consumption)} م³</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bills table */}
      <Card>
        <CardContent className="p-3">
          <div className="text-xs font-semibold mb-2">سجل الفواتير ({bills.length})</div>
          {bills.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">لا توجد فواتير.</p>
          ) : (
            <div className="overflow-auto max-h-48">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right text-[10px] h-7">التاريخ</TableHead>
                    <TableHead className="text-right text-[10px] h-7">رقم الفاتورة</TableHead>
                    <TableHead className="text-right text-[10px] h-7">الاستهلاك</TableHead>
                    <TableHead className="text-right text-[10px] h-7">المبلغ</TableHead>
                    <TableHead className="text-right text-[10px] h-7">المدفوع</TableHead>
                    <TableHead className="text-right text-[10px] h-7">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-[10px] py-1">{new Date(b.date).toLocaleDateString("ar-EG")}</TableCell>
                      <TableCell className="font-mono text-[10px] py-1">{b.serial}</TableCell>
                      <TableCell className="text-[10px] py-1">{fmtNum(b.consumption)} م³</TableCell>
                      <TableCell className="text-[10px] font-semibold py-1">{fmtYER(b.total)}</TableCell>
                      <TableCell className="text-[10px] py-1">{fmtYER(b.paid)}</TableCell>
                      <TableCell className="py-1">
                        <Badge variant={statusVariant(b.status)} className="text-[9px]">{statusLabel(b.status)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payments table */}
      <Card>
        <CardContent className="p-3">
          <div className="text-xs font-semibold mb-2">سجل الدفعات ({payments.length})</div>
          {payments.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">لا توجد دفعات.</p>
          ) : (
            <div className="overflow-auto max-h-48">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right text-[10px] h-7">التاريخ</TableHead>
                    <TableHead className="text-right text-[10px] h-7">المبلغ</TableHead>
                    <TableHead className="text-right text-[10px] h-7">الطريقة</TableHead>
                    <TableHead className="text-right text-[10px] h-7">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-[10px] py-1">{new Date(p.date).toLocaleDateString("ar-EG")}</TableCell>
                      <TableCell className="text-[10px] font-semibold py-1">{fmtYER(p.amount)}</TableCell>
                      <TableCell className="py-1">
                        <Badge variant={p.method === "cash" ? "outline" : "secondary"} className="text-[9px]">{methodLabel(p.method)}</Badge>
                      </TableCell>
                      <TableCell className="py-1">
                        <Badge variant={payStatusVariant(p.status)} className="text-[9px]">{payStatusLabel(p.status)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap">
        {(response as Extract<AiResponse, { kind: "account_statement" }>).totals.balance > 0
          ? <Button size="sm" variant="outline" onClick={() => onSuggestion("كم المتبقي عليه؟")}>كم المتبقي عليه؟</Button>
          : null}
        <Button size="sm" variant="outline" onClick={() => onSuggestion("استعلام عن التحصيل اليوم")}>تقرير التحصيل</Button>
        <Button size="sm" variant="outline" onClick={() => onSuggestion("كم إجمالي الديون؟")}>إجمالي الديون</Button>
      </div>
    </div>
  );
}

// ─── PDF Export ──────────────────────────────────────────────────────
function exportStatementPDF(response: Extract<AiResponse, { kind: "account_statement" }>) {
  const { customer, totals, lastReading, bills, payments } = response;
  const now = new Date().toLocaleString("ar-EG");

  const statusLabel = (s: string) => s === "paid" ? "مدفوعة" : s === "partial" ? "جزئية" : "غير مدفوعة";
  const payStatusLabel = (s: string) => s === "approved" ? "معتمدة" : s === "pending" ? "معلقة" : "مرفوضة";
  const methodLabel = (m: string) => m === "cash" ? "نقدي" : m === "wallet" ? "الكريمي" : "تحويل";

  const billRows = bills.map((b) => `
    <tr>
      <td>${new Date(b.date).toLocaleDateString("ar-EG")}</td>
      <td>${b.serial}</td>
      <td>${fmtNum(b.consumption)} م³</td>
      <td>${fmtYER(b.total)}</td>
      <td>${fmtYER(b.paid)}</td>
      <td>${statusLabel(b.status)}</td>
    </tr>`).join("");

  const paymentRows = payments.map((p) => `
    <tr>
      <td>${new Date(p.date).toLocaleDateString("ar-EG")}</td>
      <td>${fmtYER(p.amount)}</td>
      <td>${methodLabel(p.method)}</td>
      <td>${payStatusLabel(p.status)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<title>كشف حساب — ${customer.name}</title>
<style>
  * { font-family: "Segoe UI", Tahoma, sans-serif; }
  body { margin: 20px; color: #1e293b; }
  .header { text-align: center; border-bottom: 2px solid #0ea5e9; padding-bottom: 10px; margin-bottom: 16px; }
  .header h1 { color: #0ea5e9; font-size: 22px; margin: 0; }
  .header p { color: #64748b; font-size: 11px; margin: 2px 0 0; }
  .report-date { text-align: left; font-size: 10px; color: #94a3b8; margin-bottom: 12px; }
  .section { margin-bottom: 16px; }
  .section h2 { font-size: 13px; color: #0ea5e9; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; font-size: 11px; }
  .info-grid .label { color: #94a3b8; font-size: 10px; }
  .info-grid .value { font-weight: 600; }
  .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin-bottom: 16px; }
  .summary-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; text-align: center; }
  .summary-box .label { font-size: 10px; color: #94a3b8; }
  .summary-box .value { font-size: 14px; font-weight: 700; margin-top: 2px; }
  .summary-box.danger { border-color: #ef4444; background: #fef2f2; }
  .summary-box.danger .value { color: #ef4444; }
  .summary-box.ok { border-color: #22c55e; background: #f0fdf4; }
  .summary-box.ok .value { color: #16a34a; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: #f1f5f9; text-align: right; padding: 4px 6px; font-size: 10px; color: #475569; }
  td { padding: 4px 6px; border-bottom: 1px solid #f1f5f9; }
  .footer { margin-top: 20px; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  @media print { body { margin: 10px; } }
</style>
</head>
<body>
  <div class="header">
    <h1>MIZAN AI — كشف حساب مشترك</h1>
    <p>نظام إدارة مياه — تعز، اليمن</p>
  </div>
  <div class="report-date">تاريخ التقرير: ${now}</div>

  <div class="section">
    <h2>بيانات المشترك</h2>
    <div class="info-grid">
      <div><div class="label">الاسم</div><div class="value">${customer.name}</div></div>
      <div><div class="label">رقم العداد</div><div class="value">${customer.meterNumber ?? "—"}</div></div>
      <div><div class="label">الهاتف</div><div class="value" dir="ltr">${customer.phone}</div></div>
      <div><div class="label">الحالة</div><div class="value">${customer.status === "active" ? "نشط" : "متوقف"}</div></div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-box"><div class="label">إجمالي الفواتير</div><div class="value">${fmtYER(totals.billed)}</div></div>
    <div class="summary-box ok"><div class="label">المدفوع</div><div class="value">${fmtYER(totals.paid)}</div></div>
    <div class="summary-box danger"><div class="label">المتأخرات</div><div class="value">${fmtYER(totals.arrears)}</div></div>
    <div class="summary-box ${totals.balance > 0 ? "danger" : "ok"}"><div class="label">الرصيد النهائي</div><div class="value">${fmtYER(totals.balance)}</div></div>
  </div>

  ${lastReading ? `
  <div class="section">
    <h2>آخر قراءة</h2>
    <div class="info-grid">
      <div><div class="label">التاريخ</div><div class="value">${new Date(lastReading.date).toLocaleDateString("ar-EG")}</div></div>
      <div><div class="label">القراءة الحالية</div><div class="value">${fmtNum(lastReading.current)}</div></div>
      <div><div class="label">الاستهلاك</div><div class="value">${fmtNum(lastReading.consumption)} م³</div></div>
    </div>
  </div>` : ""}

  <div class="section">
    <h2>سجل الفواتير (${bills.length})</h2>
    <table>
      <thead><tr><th>التاريخ</th><th>رقم الفاتورة</th><th>الاستهلاك</th><th>المبلغ</th><th>المدفوع</th><th>الحالة</th></tr></thead>
      <tbody>${billRows || '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">لا توجد فواتير</td></tr>'}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>سجل الدفعات (${payments.length})</h2>
    <table>
      <thead><tr><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th><th>الحالة</th></tr></thead>
      <tbody>${paymentRows || '<tr><td colspan="4" style="text-align:center;color:#94a3b8;">لا توجد دفعات</td></tr>'}</tbody>
    </table>
  </div>

  <div class="footer">
    MIZAN AI Smart Assistant — تم إنشاء هذا التقرير آلياً من بيانات النظام
  </div>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 500);
}
