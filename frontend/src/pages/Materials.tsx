import React, { useEffect, useMemo, useState, useRef } from 'react';
import { fetchMaterials, registerMaterial, materialErrorMessage, type Material } from '../services/materials';
import { EmptyState, ErrorState, LoadingRows } from './orgShared';

export function MaterialsPage({ canRegister = false }: { canRegister?: boolean }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  // Filters
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [category, setCategory] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Registration modal
  const [showModal, setShowModal] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [modalError, setModalError] = useState('');
  const [newMaterial, setNewMaterial] = useState({
    code: '',
    name: '',
    unit: '',
    category: '',
    reorder_level: 0,
  });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword.trim().toLowerCase());
      setPage(1);
    }, 200);
    return () => clearTimeout(timer);
  }, [keyword]);

  // Load materials from API
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    fetchMaterials(controller.signal)
      .then((data) => {
        setMaterials(data);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(materialErrorMessage(err));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [attempt]);

  // Extract unique categories dynamically
  const categories = useMemo(() => {
    const set = new Set<string>();
    materials.forEach((m) => {
      if (m.category) set.add(m.category);
    });
    return Array.from(set).sort();
  }, [materials]);

  // Filtered materials
  const filtered = useMemo(() => {
    return materials.filter((m) => {
      const matchKeyword = !debouncedKeyword ||
        `${m.code} ${m.name}`.toLowerCase().includes(debouncedKeyword);
      const matchCategory = !category || m.category === category;
      return matchKeyword && matchCategory;
    });
  }, [materials, debouncedKeyword, category]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const handleResetFilters = () => {
    setKeyword('');
    setDebouncedKeyword('');
    setCategory('');
    setPage(1);
  };

  const submittingRef = useRef(false);
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setModalError('');

    if (!newMaterial.code.trim()) {
      setModalError('Material code is required.');
      return;
    }
    if (!newMaterial.name.trim()) {
      setModalError('Material name is required.');
      return;
    }
    if (!newMaterial.unit.trim()) {
      setModalError('Unit of measure is required.');
      return;
    }
    if (!newMaterial.category.trim()) {
      setModalError('Category is required.');
      return;
    }

    submittingRef.current = true;
    setRegistering(true);

    try {
      await registerMaterial({
        code: newMaterial.code.trim(),
        name: newMaterial.name.trim(),
        unit: newMaterial.unit.trim(),
        category: newMaterial.category.trim(),
        reorder_level: Number(newMaterial.reorder_level) || 0,
      });
      setShowModal(false);
      setNewMaterial({ code: '', name: '', unit: '', category: '', reorder_level: 0 });
      setAttempt((n) => n + 1);
    } catch (err) {
      setModalError(materialErrorMessage(err));
    } finally {
      submittingRef.current = false;
      setRegistering(false);
    }
  };

  return (
    <section className="manage-resource" aria-busy={loading}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WAREHOUSE & INVENTORY MASTER</div>
          <h1>Materials Catalog</h1>
          <p>Search, filter and inspect standardized material specifications across your organization.</p>
        </div>
        {canRegister && (
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              setModalError('');
              setShowModal(true);
            }}
            aria-label="Register new material"
          >
            + Register Material
          </button>
        )}
      </div>

      <div className="panel">
        <div className="manage-toolbar">
          <label className="manage-search">
            <span>Search materials</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                aria-label="Search materials by code or name"
                placeholder="Search by code or name..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                disabled={loading}
              />
              {keyword && (
                <button
                  type="button"
                  className="icon-button"
                  style={{ position: 'absolute', right: '8px', padding: '2px 6px', fontSize: '13px' }}
                  onClick={() => setKeyword('')}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </label>

          <label className="manage-filter">
            <span>Filter Category</span>
            <select
              aria-label="Filter by category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              disabled={loading}
            >
              <option value="">All Categories ({categories.length})</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          {(keyword || category) && (
            <button
              type="button"
              className="button button-outline"
              onClick={handleResetFilters}
              aria-label="Reset filters"
            >
              Reset Filters
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

        {loading && <LoadingRows label="Loading materials catalog…" columns={5} />}

        {error && (
          <div style={{ padding: '20px' }}>
            <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />
          </div>
        )}

        {!loading && !error && materials.length === 0 && (
          <div style={{ padding: '30px 20px' }}>
            <EmptyState title="No materials in catalog">
              No materials have been registered in your organization yet.
            </EmptyState>
          </div>
        )}

        {!loading && !error && materials.length > 0 && filtered.length === 0 && (
          <div style={{ padding: '30px 20px' }}>
            <EmptyState title="No matching materials">
              {keyword && category
                ? `No materials in "${category}" match "${keyword}".`
                : keyword
                ? `No materials match "${keyword}".`
                : `No materials found in "${category}".`}
            </EmptyState>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <>
            <div className="table-scroll">
              <table className="manage-table" aria-label="Materials Table">
                <thead>
                  <tr>
                    <th>Material Code</th>
                    <th>Material Name</th>
                    <th>Category</th>
                    <th>Base Unit</th>
                    <th>Reorder Threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((item) => (
                    <tr key={item.id}>
                      <td data-label="Material Code">
                        <strong style={{ fontFamily: 'monospace', letterSpacing: '0.04em' }}>{item.code}</strong>
                      </td>
                      <td data-label="Material Name">{item.name}</td>
                      <td data-label="Category">
                        <span className="role-badge" style={{ display: 'inline-block' }}>{item.category}</span>
                      </td>
                      <td data-label="Base Unit">{item.unit}</td>
                      <td data-label="Reorder Threshold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {item.reorder_level} {item.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-footer">
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span>
                  Showing {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} material{filtered.length === 1 ? '' : 's'}
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                  <span>Rows:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    style={{ height: '28px', padding: '0 6px', borderRadius: '4px', border: '1px solid var(--rule)' }}
                    aria-label="Items per page"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </label>
              </div>

              <div>
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Previous page"
                >
                  Previous
                </button>
                <span style={{ alignSelf: 'center', margin: '0 8px', fontSize: '13px' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showModal && (
        <div className="scrim" onClick={() => !registering && setShowModal(false)} role="presentation">
          <div
            className="manage-dialog"
            role="dialog"
            aria-labelledby="register-material-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-heading">
              <h2 id="register-material-title">Register Material</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowModal(false)}
                disabled={registering}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRegister} noValidate>
              {modalError && <div className="manage-error" role="alert">{modalError}</div>}

              <div className="manage-form-grid">
                <label className="manage-field" htmlFor="mat-code">
                  <span>Material Code *</span>
                  <input
                    id="mat-code"
                    required
                    disabled={registering}
                    value={newMaterial.code}
                    onChange={(e) => setNewMaterial((prev) => ({ ...prev, code: e.target.value }))}
                    placeholder="e.g. MAT-CMT-01"
                  />
                </label>

                <label className="manage-field" htmlFor="mat-name">
                  <span>Material Name *</span>
                  <input
                    id="mat-name"
                    required
                    disabled={registering}
                    value={newMaterial.name}
                    onChange={(e) => setNewMaterial((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Portland Cement Grade 43"
                  />
                </label>

                <label className="manage-field" htmlFor="mat-unit">
                  <span>Unit of Measure *</span>
                  <input
                    id="mat-unit"
                    required
                    disabled={registering}
                    value={newMaterial.unit}
                    onChange={(e) => setNewMaterial((prev) => ({ ...prev, unit: e.target.value }))}
                    placeholder="e.g. bags, tons, kg, m3"
                  />
                </label>

                <label className="manage-field" htmlFor="mat-category">
                  <span>Category *</span>
                  <input
                    id="mat-category"
                    required
                    disabled={registering}
                    value={newMaterial.category}
                    onChange={(e) => setNewMaterial((prev) => ({ ...prev, category: e.target.value }))}
                    placeholder="e.g. Cement & Aggregates"
                  />
                </label>

                <label className="manage-field" htmlFor="mat-reorder">
                  <span>Reorder Threshold</span>
                  <input
                    id="mat-reorder"
                    type="number"
                    min={0}
                    disabled={registering}
                    value={newMaterial.reorder_level}
                    onChange={(e) => setNewMaterial((prev) => ({ ...prev, reorder_level: Number(e.target.value) || 0 }))}
                  />
                </label>
              </div>

              <div className="dialog-footer" style={{ marginTop: '20px' }}>
                <button
                  type="button"
                  className="button button-outline"
                  disabled={registering}
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={registering}
                >
                  {registering ? 'Registering...' : 'Save Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default MaterialsPage;
