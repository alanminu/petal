import type { AppData } from '../types';
import { FLOW_LABELS } from '../types';
import { computeStats, deriveCycles, derivePeriods } from './cycle';
import { diffDays, fmtDate, todayISO } from './dates';

export function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per logged day. */
export function toCSV(data: AppData): string {
  const periods = derivePeriods(data.logs);
  const rows = [['date', 'cycle_day', 'flow', 'symptoms', 'moods', 'tags', 'notes']];
  for (const l of Object.values(data.logs).sort((a, b) => a.date.localeCompare(b.date))) {
    const period = [...periods].reverse().find((p) => p.start <= l.date);
    rows.push([
      l.date,
      period ? String(diffDays(l.date, period.start) + 1) : '',
      l.flow ? FLOW_LABELS[l.flow] : '',
      l.symptoms.join('; '),
      l.moods.join('; '),
      l.tags.join('; '),
      l.notes ?? '',
    ]);
  }
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}

export const toBackup = (data: AppData): string => JSON.stringify({ app: 'petal', ...data }, null, 2);

const num = (n: number | undefined, digits = 1) => (n === undefined ? '–' : n.toFixed(digits).replace(/\.0$/, ''));

/** A short summary meant to be shown to a doctor. The PDF library loads only when needed. */
export async function toPDF(data: AppData): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const periods = derivePeriods(data.logs);
  const cycles = deriveCycles(periods);
  const stats = computeStats(periods);
  const left = 48;

  doc.setFont('helvetica', 'bold').setFontSize(18).text('Cycle summary', left, 60);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(110);
  doc.text(`Generated ${fmtDate(todayISO(), true)} · self-reported data`, left, 78);
  doc.setTextColor(0).setFontSize(11);

  const summary = [
    `Average cycle length: ${num(stats.avgCycle)} days` +
      (stats.shortest !== undefined ? ` (range ${stats.shortest}–${stats.longest})` : ''),
    `Cycle-to-cycle variation: ${stats.variation === undefined ? '–' : `±${num(stats.variation)} days`}`,
    `Average period length: ${num(stats.avgPeriod)} days`,
    `Based on the ${stats.cyclesUsed} most recent complete cycle${stats.cyclesUsed === 1 ? '' : 's'}`,
  ];
  summary.forEach((line, i) => doc.text(line, left, 106 + i * 16));

  const recent = cycles.slice(-12).reverse();
  autoTable(doc, {
    startY: 106 + summary.length * 16 + 10,
    margin: { left, right: left },
    head: [['Period start', 'Period length', 'Cycle length', 'Note']],
    body: recent.map((c) => [
      fmtDate(c.start, true),
      `${c.period.days} day${c.period.days === 1 ? '' : 's'}`,
      c.length === undefined ? 'current' : `${c.length} days`,
      c.length !== undefined && !c.counted ? 'Not counted (likely gap in logging)' : '',
    ]),
    headStyles: { fillColor: [184, 64, 94] },
    styles: { fontSize: 10 },
  });

  // Symptom frequency across the same cycles.
  const since = recent.length ? recent[recent.length - 1].start : '';
  const counts = new Map<string, number>();
  for (const l of Object.values(data.logs)) {
    if (l.date < since) continue;
    for (const s of [...l.symptoms, ...l.tags]) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (top.length) {
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 28;
    doc.setFont('helvetica', 'bold').setFontSize(12).text('Symptoms and tags logged', left, y);
    autoTable(doc, {
      startY: y + 8,
      margin: { left, right: left },
      head: [['Symptom or tag', 'Days logged']],
      body: top.map(([name, n]) => [name, String(n)]),
      headStyles: { fillColor: [184, 64, 94] },
      styles: { fontSize: 10 },
    });
  }

  return doc.output('blob');
}
