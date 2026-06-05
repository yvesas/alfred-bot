import { jsPDF } from "jspdf";
import type { DashboardReport } from "./api";
import { money, monthLabel } from "./format";

// Gera um PDF do painel (resumo + mês a mês + por categoria) no navegador, sem backend.
export function exportDashboardPdf(
  report: DashboardReport,
  locale: string,
  labels: { title: string; thisMonth: string; lastMonth: string; monthly: string; byCategory: string },
): void {
  const doc = new jsPDF();
  let y = 20;

  doc.setFontSize(18);
  doc.text(labels.title, 14, y);
  y += 10;

  doc.setFontSize(11);
  doc.text(`${labels.thisMonth}: ${money(report.current.total, locale)} (${report.current.count})`, 14, y);
  y += 6;
  doc.text(`${labels.lastMonth}: ${money(report.last.total, locale)}`, 14, y);
  y += 12;

  doc.setFontSize(13);
  doc.text(labels.monthly, 14, y);
  y += 7;
  doc.setFontSize(11);
  for (const m of report.monthly) {
    doc.text(`${monthLabel(m.year, m.month)}   ${money(m.total, locale)}`, 14, y);
    y += 6;
  }

  const categories = Object.entries(report.current.byCategory).sort(([, a], [, b]) => b - a);
  if (categories.length) {
    y += 6;
    doc.setFontSize(13);
    doc.text(labels.byCategory, 14, y);
    y += 7;
    doc.setFontSize(11);
    for (const [cat, val] of categories) {
      doc.text(`${cat}   ${money(val, locale)}`, 14, y);
      y += 6;
    }
  }

  doc.save("alfred-painel.pdf");
}
