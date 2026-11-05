import type { ReactNode } from 'react';

// Small building blocks shared by the Projects and Sites pages (Jira AESCS-162 / 163).

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'green', PLANNED: 'blue', ON_HOLD: 'amber', COMPLETED: 'blue', CANCELLED: 'amber', INACTIVE: 'amber', CLOSED: 'blue',
};

export function StatusPill({ status }: { status: string }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase().replace('_', ' ');
  return <span className={`status status-${STATUS_TONE[status] ?? 'blue'}`}><i />{label}</span>;
}

export function LoadingRows({ label, columns }: { label: string; columns: number }) {
  return <div className="org-loading" role="status" aria-live="polite">
    <span className="visually-hidden">{label}</span>
    {[0, 1, 2].map((row) => <div className="skeleton-row" key={row} aria-hidden="true">
      {Array.from({ length: columns }, (_, col) => <span className="skeleton-cell" key={col} style={{ animationDelay: `${row * 120 + col * 40}ms` }} />)}
    </div>)}
  </div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="org-state org-state-error" role="alert">
    <span className="org-state-icon" aria-hidden="true">!</span>
    <div>
      <strong>Something went wrong</strong>
      <p>{message}</p>
    </div>
    <button type="button" className="button button-outline" onClick={onRetry}>Try again</button>
  </div>;
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="org-state" role="status">
    <span className="org-state-icon org-state-icon-muted" aria-hidden="true">∅</span>
    <div>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  </div>;
}

export function SearchIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}

export function PinIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
}
