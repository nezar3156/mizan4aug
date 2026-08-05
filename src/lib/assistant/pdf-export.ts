import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { AiResponse } from "../ai-intent";

/**
 * Professional PDF export for account statements using jsPDF.
 * Includes: MIZAN AI logo header, customer data, stats, readings table,
 * monthly consumption, bills table, payments table, final balance,
 * QR code, issue date, footer.
 *
 * All data comes from the existing response — no new calculations.
 */

type StatementResponse = Extract<AiResponse, { kind: "account_statement" }>;

const PRIMARY: [number, number, number] = [14, 165, 233];
const DARK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const LIGHT: [number, number, number] = [241, 245, 249];
const DANGER: [number, number, number] = [239, 68, 68];
const OK: [number, number, number] = [22, 163, 74];
const WHITE: [number, number, number] = [255, 255, 255];

function statusLabel(s: string): string {
  return s === "paid" ? "مدفوعة" : s === "partial" ? "جزئية" : "غير مدفوعة";
}
function payStatusLabel(s: string): string {
  return s === "approved" ? "معتمدة" : s === "pending" ? "معلقة" : "مرفوضة";
}
function methodLabel(m: string): string {
  return m === "cash" ? "نقدي" : m === "wallet" ? "الكريمي" : "تحويل";
}

export async function exportStatementPDF(response: StatementResponse): Promise<void> {
  const { customer, totals, stats, lastReading, readings, monthlyConsumption, bills, payments } = response;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pageW, 25, "F");
  doc.setTextColor(...WHITE);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("MIZAN AI", margin, 12);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Smart Assistant - Account Statement", margin, 18);
  doc.setFontSize(8);
  doc.text(new Date().toLocaleString("en-GB"), pageW - margin, 12, { align: "right" });

  y = 32;
  doc.setTextColor(...DARK);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Customer Account Statement", pageW / 2, y, { align: "center" });
  y += 6;

  doc.setDrawColor(...PRIMARY);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 5;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const infoLines: Array<[string, string]> = [
    ["Name", customer.name],
    ["Meter", customer.meterNumber ?? "-"],
    ["Phone", customer.phone],
    ["Status", customer.status === "active" ? "Active" : "Suspended"],
  ];
  if (customer.directorate) infoLines.push(["Directorate", customer.directorate]);

  for (const [label, value] of infoLines) {
    doc.setTextColor(...MUTED);
    doc.text(label + ":", margin, y);
    doc.setTextColor(...DARK);
    doc.text(String(value), margin + 35, y);
    y += 5;
  }
  y += 3;

  const boxW = (pageW - margin * 2 - 9) / 4;
  const boxH = 14;
  const summaries: Array<{ label: string; value: string; color: [number, number, number] }> = [
    { label: "Total Billed", value: fmtYERShort(totals.billed), color: DARK },
    { label: "Paid", value: fmtYERShort(totals.paid), color: OK },
    { label: "Arrears", value: fmtYERShort(totals.arrears), color: DANGER },
    { label: "Balance", value: fmtYERShort(totals.balance), color: totals.balance > 0 ? DANGER : OK },
  ];

  summaries.forEach((s, i) => {
    const x = margin + i * (boxW + 3);
    doc.setFillColor(...LIGHT);
    doc.roundedRect(x, y, boxW, boxH, 1.5, 1.5, "F");
    doc.setTextColor(...MUTED);
    doc.setFontSize(7);
    doc.text(s.label, x + 2, y + 5);
    doc.setTextColor(...s.color);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(s.value, x + 2, y + 11);
    doc.setFont("helvetica", "normal");
  });
  y += boxH + 5;

  // ── Stats row ─────────────────────────────────────────────────
  if (stats) {
    const statBoxes: Array<{ label: string; value: string; color: [number, number, number] }> = [
      { label: "Bills", value: String(stats.billCount), color: DARK },
      { label: "Collection %", value: stats.collectionPct + "%", color: stats.collectionPct >= 70 ? OK : DANGER },
      { label: "Highest Bill", value: fmtYERShort(stats.highestBill), color: DARK },
      { label: "Lowest Bill", value: fmtYERShort(stats.lowestBill), color: DARK },
    ];
    statBoxes.forEach((st, i) => {
      const x = margin + i * (boxW + 3);
      doc.setFillColor(...LIGHT);
      doc.roundedRect(x, y, boxW, boxH, 1.5, 1.5, "F");
      doc.setTextColor(...MUTED);
      doc.setFontSize(7);
      doc.text(st.label, x + 2, y + 5);
      doc.setTextColor(...st.color);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(st.value, x + 2, y + 11);
      doc.setFont("helvetica", "normal");
    });
    y += boxH + 5;
  }

  if (lastReading) {
    doc.setTextColor(...PRIMARY);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Last Reading", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...DARK);
    const rd = new Date(lastReading.date).toLocaleDateString("en-GB");
    doc.text(`Date: ${rd}`, margin, y);
    doc.text(`Current: ${lastReading.current}`, margin + 55, y);
    doc.text(`Consumption: ${lastReading.consumption} m3`, margin + 100, y);
    y += 6;
  }

  // ── Readings table ─────────────────────────────────────────────
  if (readings && readings.length > 0) {
    y = drawTable(doc, margin, y, pageW - margin * 2, "Readings History",
      ["Date", "Previous", "Current", "Consumption", "Status"],
      readings.slice(0, 20).map((r) => [
        new Date(r.date).toLocaleDateString("en-GB"),
        String(r.previous), String(r.current),
        String(r.consumption) + " m3",
        r.status === "approved" ? "Approved" : r.status === "rejected" ? "Rejected" : "Pending",
      ]),
      pageH);
  }

  // ── Monthly consumption ─────────────────────────────────────────
  if (monthlyConsumption && monthlyConsumption.length > 0) {
    if (y > pageH - 25) { doc.addPage(); y = margin; }
    doc.setTextColor(...PRIMARY);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Monthly Consumption (Last 12 months)", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...DARK);
    const colW = (pageW - margin * 2) / Math.min(monthlyConsumption.length, 12);
    monthlyConsumption.slice(0, 12).forEach((m, i) => {
      const x = margin + i * colW;
      doc.text(m.month, x + 1, y);
      doc.text(String(m.consumption), x + 1, y + 4);
    });
    y += 10;
  }

  y = drawTable(doc, margin, y, pageW - margin * 2, "Bills History",
    ["Date", "Invoice #", "Consumption", "Amount", "Paid", "Status"],
    bills.map((b) => [new Date(b.date).toLocaleDateString("en-GB"), b.serial, String(b.consumption) + " m3", fmtYERShort(b.total), fmtYERShort(b.paid), statusLabel(b.status)]),
    pageH);

  y = drawTable(doc, margin, y, pageW - margin * 2, "Payments History",
    ["Date", "Amount", "Method", "Status"],
    payments.map((p) => [new Date(p.date).toLocaleDateString("en-GB"), fmtYERShort(p.amount), methodLabel(p.method), payStatusLabel(p.status)]),
    pageH);

  if (y > pageH - 45) { doc.addPage(); y = margin; }
  y += 5;
  doc.setFillColor(...(totals.balance > 0 ? DANGER : OK));
  doc.roundedRect(margin, y, pageW - margin * 2, 12, 2, 2, "F");
  doc.setTextColor(...WHITE);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Final Balance:", margin + 3, y + 8);
  doc.text(fmtYERShort(totals.balance), pageW - margin - 3, y + 8, { align: "right" });
  y += 16;

  const qrData = JSON.stringify({ customer: customer.name, meter: customer.meterNumber ?? "", balance: totals.balance, date: new Date().toISOString().slice(0, 10) });
  try {
    const qrDataUrl = await QRCode.toDataURL(qrData, { width: 100, margin: 0 });
    const qrSize = 22;
    if (y + qrSize > pageH - 15) { doc.addPage(); y = margin; }
    doc.addImage(qrDataUrl, "PNG", pageW - margin - qrSize, y, qrSize, qrSize);
    doc.setTextColor(...MUTED);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("Scan to verify", pageW - margin - qrSize, y + qrSize + 4);
  } catch { /* QR generation failed — non-fatal */ }

  const footerY = pageH - 10;
  doc.setDrawColor(...LIGHT);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY - 3, pageW - margin, footerY - 3);
  doc.setTextColor(...MUTED);
  doc.setFontSize(7);
  doc.text("Generated by MIZAN AI Smart Assistant", margin, footerY);
  doc.text(new Date().toLocaleString("en-GB"), pageW - margin, footerY, { align: "right" });

  const fileName = `MIZAN_Statement_${customer.name.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}

function fmtYERShort(n: number): string {
  return Math.round(n).toLocaleString("en-US") + " YER";
}

function drawTable(doc: jsPDF, x: number, y: number, w: number, title: string, headers: string[], rows: string[][], pageH: number): number {
  const colW = w / headers.length;
  const rowH = 6;
  const headerH = 7;
  if (y > pageH - 30) { doc.addPage(); y = 15; }
  doc.setTextColor(...PRIMARY);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(title, x, y);
  y += 4;
  doc.setFillColor(...PRIMARY);
  doc.rect(x, y, w, headerH, "F");
  doc.setTextColor(...WHITE);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  headers.forEach((h, i) => { doc.text(h, x + i * colW + 1.5, y + 5); });
  y += headerH;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  rows.forEach((row, ri) => {
    if (y > pageH - 15) { doc.addPage(); y = 15; }
    if (ri % 2 === 0) { doc.setFillColor(...LIGHT); doc.rect(x, y, w, rowH, "F"); }
    doc.setTextColor(...DARK);
    row.forEach((cell, ci) => { doc.text(cell.length > 18 ? cell.slice(0, 16) + ".." : cell, x + ci * colW + 1.5, y + 4.5); });
    y += rowH;
  });
  if (rows.length === 0) { doc.setTextColor(...MUTED); doc.text("No records", x + 2, y + 4); y += rowH; }
  return y + 4;
}
