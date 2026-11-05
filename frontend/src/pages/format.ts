// Display helpers for the Projects and Sites pages (kept separate so React fast refresh works).

export function formatDate(value: string | null): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** How far through its schedule a project is, for the progress bar on project cards. */
export function scheduleProgress(start: string | null, end: string | null, now = new Date()): { percent: number; label: string } {
  if (!start || !end) return { percent: 0, label: 'No schedule set' };
  const s = new Date(`${start}T00:00:00`).getTime();
  const e = new Date(`${end}T23:59:59`).getTime();
  const t = now.getTime();
  if (t < s) {
    const days = Math.ceil((s - t) / 86400000);
    return { percent: 0, label: `Starts in ${days} ${days === 1 ? 'day' : 'days'}` };
  }
  if (t > e) return { percent: 100, label: 'Schedule ended' };
  const percent = Math.round(((t - s) / (e - s)) * 100);
  return { percent, label: `${percent}% of schedule elapsed` };
}
