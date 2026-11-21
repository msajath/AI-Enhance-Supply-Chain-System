import { useEffect, useMemo, useState } from 'react';
import {
  fetchSuppliers,
  fetchPricingHistory,
  procurementErrorMessage,
  type Supplier,
  type PricingHistoryRecord,
} from '../services/procurement';
import { StatusPill, EmptyState, ErrorState, LoadingRows } from './orgShared';

export function SuppliersPage({ canViewPricing = true }: { canViewPricing?: boolean }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Pricing History Modal
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [pricingHistory, setPricingHistory] = useState<PricingHistoryRecord[]>([]);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateError, setDateError] = useState('');

  // Load suppliers from API
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    fetchSuppliers(controller.signal)
      .then((data) => setSuppliers(data))
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(procurementErrorMessage(err, 'supplier records'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [attempt]);

  // Load pricing history when selected supplier or date filters change
  useEffect(() => {
    if (!selectedSupplier) {
      setPricingHistory([]);
      setPricingError('');
      setDateError('');
      return;
    }

    if (!canViewPricing) {
      setPricingError('You do not have permission to view supplier pricing history. Role-based authorization is enforced.');
      return;
    }

    if (startDate && endDate && endDate < startDate) {
      setDateError('End date cannot precede start date.');
      return;
    }
    setDateError('');

    const controller = new AbortController();
    setPricingLoading(true);
    setPricingError('');

    fetchPricingHistory(selectedSupplier.id, startDate, endDate, controller.signal)
      .then((records) => setPricingHistory(records))
      .catch((err) => {
        if (!controller.signal.aborted) {
          setPricingError(procurementErrorMessage(err, 'supplier pricing history'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setPricingLoading(false);
        }
      });

    return () => controller.abort();
  }, [selectedSupplier, startDate, endDate, canViewPricing]);

  // Filtered suppliers
  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      const matchSearch = !q ||
        `${s.name} ${s.code} ${s.contact_person} ${s.email} ${s.phone}`.toLowerCase().includes(q);
      const matchStatus = !statusFilter || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [suppliers, search, statusFilter]);

  const handleOpenPricing = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setStartDate('');
    setEndDate('');
    setDateError('');
  };

  return (
    <section className="manage-resource" aria-busy={loading}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PROCUREMENT & SOURCING</div>
          <h1>Supplier Records</h1>
          <p>Verified supplier contacts, active contracts, and date-scoped material pricing history.</p>
        </div>
      </div>

      <div className="panel">
        <div className="manage-toolbar">
          <label className="manage-search">
            <span>Search suppliers</span>
            <input
              aria-label="Search suppliers"
              placeholder="Search by supplier name, code, or contact person..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={loading}
            />
          </label>

          <label className="manage-filter">
            <span>Status</span>
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              disabled={loading}
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </select>
          </label>

          {(search || statusFilter) && (
            <button
              type="button"
              className="button button-outline"
              onClick={() => {
                setSearch('');
                setStatusFilter('');
              }}
              aria-label="Reset search filters"
            >
              Reset
            </button>
          )}

          <button
            type="button"
            className="button button-outline"
            onClick={() => setAttempt((n) => n + 1)}
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        {loading && <LoadingRows label="Loading supplier directory…" columns={6} />}

        {error && (
          <div style={{ padding: '20px' }}>
            <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />
          </div>
        )}

        {!loading && !error && suppliers.length === 0 && (
          <div style={{ padding: '30px 20px' }}>
            <EmptyState title="No suppliers on record">
              No supplier profiles have been registered in your organization yet.
            </EmptyState>
          </div>
        )}

        {!loading && !error && suppliers.length > 0 && filteredSuppliers.length === 0 && (
          <div style={{ padding: '30px 20px' }}>
            <EmptyState title="No matching suppliers">
              No supplier records match your current search or status filter.
            </EmptyState>
          </div>
        )}

        {!loading && !error && filteredSuppliers.length > 0 && (
          <div className="table-scroll">
            <table className="manage-table" aria-label="Suppliers Table">
              <thead>
                <tr>
                  <th>Supplier Code</th>
                  <th>Supplier Name</th>
                  <th>Contact Person</th>
                  <th>Contact Details</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td data-label="Supplier Code">
                      <strong style={{ fontFamily: 'monospace' }}>{supplier.code}</strong>
                    </td>
                    <td data-label="Supplier Name">
                      <div>
                        <strong>{supplier.name}</strong>
                        {supplier.address && (
                          <div style={{ fontSize: '12px', color: 'var(--steel)' }}>{supplier.address}</div>
                        )}
                      </div>
                    </td>
                    <td data-label="Contact Person">{supplier.contact_person}</td>
                    <td data-label="Contact Details">
                      <div>{supplier.email}</div>
                      <small style={{ color: 'var(--steel)' }}>{supplier.phone}</small>
                    </td>
                    <td data-label="Status">
                      <StatusPill status={supplier.status} />
                    </td>
                    <td data-label="Actions" className="manage-actions">
                      <button
                        type="button"
                        className="button button-outline button-sm"
                        onClick={() => handleOpenPricing(supplier)}
                        aria-label={`View pricing history for ${supplier.name}`}
                      >
                        Pricing History
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedSupplier && (
        <div className="scrim" onClick={() => setSelectedSupplier(null)} role="presentation">
          <div
            className="manage-dialog"
            role="dialog"
            aria-labelledby="pricing-modal-title"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '840px', width: '100%' }}
          >
            <div className="dialog-heading">
              <div>
                <h2 id="pricing-modal-title">Pricing History · {selectedSupplier.name}</h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--steel)' }}>
                  Code: {selectedSupplier.code} · Contact: {selectedSupplier.contact_person} ({selectedSupplier.phone})
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setSelectedSupplier(null)}
                aria-label="Close pricing history modal"
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', paddingBottom: '16px', borderBottom: '1px solid var(--rule)' }}>
              <label className="manage-field" style={{ minWidth: '150px' }}>
                <span>From Date</span>
                <input
                  type="date"
                  aria-label="Pricing history start date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>

              <label className="manage-field" style={{ minWidth: '150px' }}>
                <span>To Date</span>
                <input
                  type="date"
                  aria-label="Pricing history end date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  aria-invalid={Boolean(dateError)}
                />
              </label>

              {(startDate || endDate) && (
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                    setDateError('');
                  }}
                  aria-label="Clear date range"
                >
                  Clear Dates
                </button>
              )}
            </div>

            {dateError && <div className="manage-error" role="alert" style={{ marginTop: '12px' }}>{dateError}</div>}
            {pricingError && <div className="manage-error" role="alert" style={{ marginTop: '12px' }}>{pricingError}</div>}

            {pricingLoading && <LoadingRows label="Fetching historical pricing records…" columns={5} />}

            {!pricingLoading && !pricingError && !dateError && pricingHistory.length === 0 && (
              <div style={{ padding: '28px 12px' }}>
                <EmptyState title="No pricing history recorded">
                  {startDate || endDate
                    ? 'No price history matches the specified date window for this supplier.'
                    : 'No historical quotations or price agreements have been registered for this supplier.'}
                </EmptyState>
              </div>
            )}

            {!pricingLoading && !pricingError && pricingHistory.length > 0 && (
              <div className="table-scroll" style={{ marginTop: '16px' }}>
                <table className="manage-table" aria-label="Pricing History Table">
                  <thead>
                    <tr>
                      <th>Material Code</th>
                      <th>Material Name</th>
                      <th>Unit Price</th>
                      <th>Effective Window</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricingHistory.map((item) => (
                      <tr key={item.id}>
                        <td data-label="Material Code">
                          <strong style={{ fontFamily: 'monospace' }}>{item.material_code}</strong>
                        </td>
                        <td data-label="Material Name">{item.material_name}</td>
                        <td data-label="Unit Price" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          ${Number(item.unit_price).toFixed(2)} / {item.unit}
                        </td>
                        <td data-label="Effective Window">
                          {item.effective_date} {item.expiry_date ? `to ${item.expiry_date}` : '(current)'}
                        </td>
                        <td data-label="Notes">
                          {item.note || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="dialog-footer" style={{ marginTop: '20px' }}>
              <button
                type="button"
                className="button button-outline"
                onClick={() => setSelectedSupplier(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default SuppliersPage;
