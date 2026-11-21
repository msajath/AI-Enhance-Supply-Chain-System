import React, { useEffect, useState, useRef } from 'react';
import {
  fetchRequisitions,
  createRequisition,
  fetchApprovalQueue,
  approveRequisition,
  rejectRequisition,
  requisitionErrorMessage,
  type PurchaseRequisition,
  type ApprovalRequest,
} from '../services/requisitions';
import { fetchProjects, type Project } from '../services/organization';
import { fetchMaterials, type Material } from '../services/materials';
import { StatusPill, EmptyState, ErrorState, LoadingRows } from './orgShared';

export function RequisitionsPage({ isApprover = false }: { isApprover?: boolean }) {
  const [tab, setTab] = useState<'create' | 'list' | 'queue'>(isApprover ? 'queue' : 'create');

  // Shared Reference Data
  const [projects, setProjects] = useState<Project[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  // Form State
  const [projectId, setProjectId] = useState('');
  const [requiredByDate, setRequiredByDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Array<{ material_id: string; quantity: string; unit: string }>>([
    { material_id: '', quantity: '1', unit: '' },
  ]);
  const [formErrors, setFormErrors] = useState<{ project?: string; date?: string; lines?: string }>({});
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Requisitions List State
  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [loadingRequisitions, setLoadingRequisitions] = useState(false);
  const [requisitionsError, setRequisitionsError] = useState('');
  const [viewingRequisition, setViewingRequisition] = useState<PurchaseRequisition | null>(null);

  // Approver Queue State
  const [queue, setQueue] = useState<ApprovalRequest[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [queueError, setQueueError] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [decisionAction, setDecisionAction] = useState<'approve' | 'reject' | null>(null);
  const [decisionComments, setDecisionComments] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [queueSuccess, setQueueSuccess] = useState('');

  // Load projects & materials for form
  useEffect(() => {
    const controller = new AbortController();
    setLoadingRefs(true);
    Promise.all([
      fetchProjects(controller.signal).then((res) => res.projects).catch(() => []),
      fetchMaterials(controller.signal).catch(() => []),
    ])
      .then(([prjs, mats]) => {
        setProjects(prjs);
        setMaterials(mats);
      })
      .finally(() => setLoadingRefs(false));

    return () => controller.abort();
  }, []);

  // Load Requisitions list when tab is 'list'
  useEffect(() => {
    if (tab !== 'list') return;
    const controller = new AbortController();
    setLoadingRequisitions(true);
    setRequisitionsError('');

    fetchRequisitions(controller.signal)
      .then((data) => setRequisitions(data))
      .catch((err) => {
        if (!controller.signal.aborted) {
          setRequisitionsError(requisitionErrorMessage(err, 'requisitions'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingRequisitions(false);
        }
      });

    return () => controller.abort();
  }, [tab]);

  // Load Approver Queue when tab is 'queue'
  const loadQueue = () => {
    const controller = new AbortController();
    setLoadingQueue(true);
    setQueueError('');

    fetchApprovalQueue(controller.signal)
      .then((data) => setQueue(data))
      .catch((err) => {
        if (!controller.signal.aborted) {
          setQueueError(requisitionErrorMessage(err, 'approval queue'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingQueue(false);
        }
      });

    return () => controller.abort();
  };

  useEffect(() => {
    if (tab === 'queue') {
      loadQueue();
    }
  }, [tab]);

  // Form line manipulation
  const handleAddLine = () => {
    setLines((prev) => [...prev, { material_id: '', quantity: '1', unit: '' }]);
    setFormErrors((prev) => ({ ...prev, lines: undefined }));
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
    setFormErrors((prev) => ({ ...prev, lines: undefined }));
  };

  const handleMaterialChange = (index: number, matId: string) => {
    const mat = materials.find((m) => m.id === matId);
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, material_id: matId, unit: mat?.unit ?? '' } : line))
    );
    setFormErrors((prev) => ({ ...prev, lines: undefined }));
  };

  const handleQuantityChange = (index: number, qty: string) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, quantity: qty } : line)));
    setFormErrors((prev) => ({ ...prev, lines: undefined }));
  };

  const validateForm = (): boolean => {
    const errs: { project?: string; date?: string; lines?: string } = {};
    if (!projectId) errs.project = 'Project is required.';
    if (!requiredByDate) errs.date = 'Required-by date is required.';

    if (lines.length === 0) {
      errs.lines = 'Requisition must contain at least one material line.';
    } else {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.material_id) {
          errs.lines = `Line ${i + 1}: Please select a material.`;
          break;
        }
        const q = Number(line.quantity);
        if (!line.quantity.trim() || isNaN(q) || q <= 0) {
          errs.lines = `Line ${i + 1}: Quantity must be greater than zero.`;
          break;
        }
      }
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmitRequisition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setFormError('');
    setFormSuccess('');

    if (!validateForm()) return;

    submittingRef.current = true;
    setFormSubmitting(true);

    try {
      const payload = {
        project_id: projectId,
        required_by_date: requiredByDate,
        notes: notes.trim() || null,
        items: lines.map((l) => ({
          material_id: l.material_id,
          quantity: Number(l.quantity),
        })),
      };

      const result = await createRequisition(payload);
      setFormSuccess(`Requisition ${result.code || 'created'} submitted successfully for approval.`);
      setRequiredByDate('');
      setNotes('');
      setLines([{ material_id: '', quantity: '1', unit: '' }]);
    } catch (err) {
      setFormError(requisitionErrorMessage(err, 'purchase requisition'));
    } finally {
      submittingRef.current = false;
      setFormSubmitting(false);
    }
  };

  // Approver Action Submission
  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || !decisionAction || decisionSubmitting) return;

    setDecisionError('');
    if (decisionAction === 'reject' && !decisionComments.trim()) {
      setDecisionError('Rejection reason is required.');
      return;
    }

    setDecisionSubmitting(true);
    try {
      if (decisionAction === 'approve') {
        await approveRequisition(selectedRequest.id, decisionComments.trim() || undefined);
        setQueueSuccess(`Requisition ${selectedRequest.requisition_code} approved successfully.`);
      } else {
        await rejectRequisition(selectedRequest.id, decisionComments.trim());
        setQueueSuccess(`Requisition ${selectedRequest.requisition_code} rejected.`);
      }
      setSelectedRequest(null);
      setDecisionAction(null);
      setDecisionComments('');
      loadQueue();
    } catch (err) {
      setDecisionError(requisitionErrorMessage(err, 'approval decision'));
    } finally {
      setDecisionSubmitting(false);
    }
  };

  return (
    <section className="manage-resource">
      <div className="page-heading">
        <div>
          <div className="eyebrow">PROCUREMENT & WORKFLOW</div>
          <h1>Purchase Requisitions & Approvals</h1>
          <p>Create multi-line material requisitions and review assigned approval queues in your project scope.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={`button ${tab === 'create' ? 'button-primary' : 'button-outline'}`}
            onClick={() => setTab('create')}
          >
            New Requisition
          </button>
          <button
            type="button"
            className={`button ${tab === 'list' ? 'button-primary' : 'button-outline'}`}
            onClick={() => setTab('list')}
          >
            My Requisitions
          </button>
          <button
            type="button"
            className={`button ${tab === 'queue' ? 'button-primary' : 'button-outline'}`}
            onClick={() => setTab('queue')}
          >
            Approval Queue {queue.length > 0 && `(${queue.length})`}
          </button>
        </div>
      </div>

      {tab === 'create' && (
        <div className="panel" style={{ padding: '24px', maxWidth: '880px' }}>
          <div className="dialog-heading" style={{ marginBottom: '16px' }}>
            <h2>Create Purchase Requisition</h2>
          </div>

          {formSuccess && <div className="manage-success" role="status">{formSuccess}</div>}
          {formError && <div className="manage-error" role="alert">{formError}</div>}

          <form onSubmit={handleSubmitRequisition} noValidate aria-busy={formSubmitting}>
            <div className="manage-form-grid">
              <label className="manage-field" htmlFor="req-project">
                <span>Project *</span>
                <select
                  id="req-project"
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    if (formErrors.project) setFormErrors((prev) => ({ ...prev, project: undefined }));
                  }}
                  disabled={formSubmitting || loadingRefs}
                  aria-invalid={Boolean(formErrors.project)}
                  aria-describedby={formErrors.project ? 'req-project-error' : undefined}
                >
                  <option value="">Select project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                  ))}
                </select>
                {formErrors.project && <small id="req-project-error" className="field-error">{formErrors.project}</small>}
              </label>

              <label className="manage-field" htmlFor="req-required-date">
                <span>Required By Date *</span>
                <input
                  id="req-required-date"
                  type="date"
                  required
                  value={requiredByDate}
                  onChange={(e) => {
                    setRequiredByDate(e.target.value);
                    if (formErrors.date) setFormErrors((prev) => ({ ...prev, date: undefined }));
                  }}
                  disabled={formSubmitting}
                  aria-invalid={Boolean(formErrors.date)}
                  aria-describedby={formErrors.date ? 'req-date-error' : undefined}
                />
                {formErrors.date && <small id="req-date-error" className="field-error">{formErrors.date}</small>}
              </label>

              <label className="manage-field field-wide" htmlFor="req-notes">
                <span>Notes & Justification</span>
                <textarea
                  id="req-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={formSubmitting}
                  placeholder="Reason for requisition, delivery site specifications, or contractor notes..."
                />
              </label>
            </div>

            <div style={{ marginTop: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Material Line Items *</h3>
                <button
                  type="button"
                  className="button button-outline button-sm"
                  onClick={handleAddLine}
                  disabled={formSubmitting}
                  aria-label="Add material line"
                >
                  + Add Material Line
                </button>
              </div>

              {formErrors.lines && <div className="manage-error" role="alert" style={{ marginBottom: '10px' }}>{formErrors.lines}</div>}

              <div className="table-scroll">
                <table className="manage-table" aria-label="Requisition line items table">
                  <thead>
                    <tr>
                      <th style={{ width: '45%' }}>Material *</th>
                      <th style={{ width: '20%' }}>Base Unit</th>
                      <th style={{ width: '25%' }}>Quantity *</th>
                      <th style={{ width: '10%' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={idx}>
                        <td>
                          <select
                            aria-label={`Material selection for line ${idx + 1}`}
                            value={line.material_id}
                            onChange={(e) => handleMaterialChange(idx, e.target.value)}
                            disabled={formSubmitting || loadingRefs}
                            required
                          >
                            <option value="">Select material</option>
                            {materials.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.code})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="text"
                            readOnly
                            disabled
                            value={line.unit || '—'}
                            style={{ background: 'var(--concrete)' }}
                            aria-label={`Unit for line ${idx + 1}`}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            required
                            aria-label={`Quantity for line ${idx + 1}`}
                            value={line.quantity}
                            onChange={(e) => handleQuantityChange(idx, e.target.value)}
                            disabled={formSubmitting}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => handleRemoveLine(idx)}
                            disabled={lines.length <= 1 || formSubmitting}
                            aria-label={`Remove line ${idx + 1}`}
                            title="Remove line"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="dialog-footer" style={{ marginTop: '24px' }}>
              <button
                type="submit"
                className="button button-primary"
                disabled={formSubmitting}
              >
                {formSubmitting ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Submitting Requisition...
                  </>
                ) : (
                  'Submit Requisition'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === 'list' && (
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>My Purchase Requisitions</h2>
              <p>Requisitions submitted across your active construction projects.</p>
            </div>
            <button
              type="button"
              className="button button-outline"
              onClick={() => setTab('create')}
            >
              + Create Requisition
            </button>
          </div>

          {loadingRequisitions && <LoadingRows label="Loading purchase requisitions…" columns={6} />}
          {requisitionsError && (
            <div style={{ padding: '20px' }}>
              <ErrorState message={requisitionsError} onRetry={() => setTab('list')} />
            </div>
          )}

          {!loadingRequisitions && !requisitionsError && requisitions.length === 0 && (
            <div style={{ padding: '30px 20px' }}>
              <EmptyState title="No requisitions found">
                You have not submitted any purchase requisitions yet.
              </EmptyState>
            </div>
          )}

          {!loadingRequisitions && !requisitionsError && requisitions.length > 0 && (
            <div className="table-scroll">
              <table className="manage-table" aria-label="Requisitions List">
                <thead>
                  <tr>
                    <th>Requisition Code</th>
                    <th>Project</th>
                    <th>Requester</th>
                    <th>Required Date</th>
                    <th>Status</th>
                    <th>Items</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requisitions.map((req) => (
                    <tr key={req.id}>
                      <td data-label="Requisition Code">
                        <strong style={{ fontFamily: 'monospace' }}>{req.code}</strong>
                      </td>
                      <td data-label="Project">{req.project_name}</td>
                      <td data-label="Requester">{req.requester_name}</td>
                      <td data-label="Required Date">{req.required_by_date}</td>
                      <td data-label="Status">
                        <StatusPill status={req.status} />
                      </td>
                      <td data-label="Items">{req.items?.length || 0} line items</td>
                      <td data-label="Actions" className="manage-actions">
                        <button
                          type="button"
                          className="button button-outline button-sm"
                          onClick={() => setViewingRequisition(req)}
                          aria-label={`View details for ${req.code}`}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'queue' && (
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Assigned Approval Queue</h2>
              <p>Pending purchase requisitions assigned to you for review and sign-off.</p>
            </div>
            <button
              type="button"
              className="button button-outline"
              onClick={loadQueue}
              disabled={loadingQueue}
            >
              Refresh Queue
            </button>
          </div>

          {queueSuccess && <div className="manage-success" role="status" style={{ margin: '0 20px 16px' }}>{queueSuccess}</div>}
          {loadingQueue && <LoadingRows label="Checking your assigned approval queue…" columns={6} />}
          {queueError && (
            <div style={{ padding: '20px' }}>
              <ErrorState message={queueError} onRetry={loadQueue} />
            </div>
          )}

          {!loadingQueue && !queueError && queue.length === 0 && (
            <div style={{ padding: '30px 20px' }}>
              <EmptyState title="No pending approvals">
                Your queue is clear. There are no purchase requisitions awaiting your decision.
              </EmptyState>
            </div>
          )}

          {!loadingQueue && !queueError && queue.length > 0 && (
            <div className="table-scroll">
              <table className="manage-table" aria-label="Approver Queue Table">
                <thead>
                  <tr>
                    <th>Requisition Code</th>
                    <th>Project</th>
                    <th>Requester</th>
                    <th>Required Date</th>
                    <th>Total Items</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((req) => (
                    <tr key={req.id}>
                      <td data-label="Requisition Code">
                        <strong style={{ fontFamily: 'monospace' }}>{req.requisition_code}</strong>
                      </td>
                      <td data-label="Project">{req.project_name}</td>
                      <td data-label="Requester">{req.requester_name}</td>
                      <td data-label="Required Date">{req.required_by_date}</td>
                      <td data-label="Total Items">{req.total_items} items</td>
                      <td data-label="Status">
                        <StatusPill status={req.status} />
                      </td>
                      <td data-label="Actions" className="manage-actions">
                        <button
                          type="button"
                          className="button button-primary button-sm"
                          onClick={() => {
                            setSelectedRequest(req);
                            setDecisionAction('approve');
                            setDecisionComments('');
                            setDecisionError('');
                          }}
                          aria-label={`Review and approve ${req.requisition_code}`}
                        >
                          Review & Decide
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Requisition Line Items Details Modal */}
      {viewingRequisition && (
        <div className="scrim" onClick={() => setViewingRequisition(null)} role="presentation">
          <div
            className="manage-dialog"
            role="dialog"
            aria-labelledby="req-details-title"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '720px', width: '100%' }}
          >
            <div className="dialog-heading">
              <div>
                <h2 id="req-details-title">Requisition {viewingRequisition.code}</h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--steel)' }}>
                  Project: {viewingRequisition.project_name} · Required: {viewingRequisition.required_by_date}
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setViewingRequisition(null)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            {viewingRequisition.notes && (
              <p style={{ marginTop: '14px', padding: '10px 14px', background: 'var(--concrete)', borderRadius: 'var(--r-control)', fontSize: '13.5px' }}>
                <strong>Notes:</strong> {viewingRequisition.notes}
              </p>
            )}

            <div className="table-scroll" style={{ marginTop: '16px' }}>
              <table className="manage-table" aria-label="Requisition line items">
                <thead>
                  <tr>
                    <th>Material Code</th>
                    <th>Material Name</th>
                    <th>Quantity</th>
                    <th>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingRequisition.items?.map((item, idx) => (
                    <tr key={idx}>
                      <td><strong style={{ fontFamily: 'monospace' }}>{item.material_code}</strong></td>
                      <td>{item.material_name}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{item.quantity}</td>
                      <td>{item.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="dialog-footer" style={{ marginTop: '20px' }}>
              <button
                type="button"
                className="button button-outline"
                onClick={() => setViewingRequisition(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approver Decision Modal */}
      {selectedRequest && decisionAction && (
        <div className="scrim" onClick={() => !decisionSubmitting && setSelectedRequest(null)} role="presentation">
          <div
            className="manage-dialog"
            role="dialog"
            aria-labelledby="decision-modal-title"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '780px', width: '100%' }}
          >
            <div className="dialog-heading">
              <div>
                <h2 id="decision-modal-title">
                  {decisionAction === 'approve' ? 'Approve Requisition' : 'Reject Requisition'} · {selectedRequest.requisition_code}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--steel)' }}>
                  Requester: {selectedRequest.requester_name} · Project: {selectedRequest.project_name}
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setSelectedRequest(null)}
                disabled={decisionSubmitting}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            {decisionError && <div className="manage-error" role="alert" style={{ marginTop: '12px' }}>{decisionError}</div>}

            <div className="table-scroll" style={{ marginTop: '16px' }}>
              <table className="manage-table" aria-label="Line items to review">
                <thead>
                  <tr>
                    <th>Material Code</th>
                    <th>Material Name</th>
                    <th>Quantity</th>
                    <th>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRequest.items?.map((item, idx) => (
                    <tr key={idx}>
                      <td><strong style={{ fontFamily: 'monospace' }}>{item.material_code}</strong></td>
                      <td>{item.material_name}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{item.quantity}</td>
                      <td>{item.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form onSubmit={handleDecisionSubmit} noValidate style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                  type="button"
                  className={`button ${decisionAction === 'approve' ? 'button-primary' : 'button-outline'}`}
                  onClick={() => setDecisionAction('approve')}
                  disabled={decisionSubmitting}
                >
                  Approve Requisition
                </button>
                <button
                  type="button"
                  className={`button ${decisionAction === 'reject' ? 'button-primary' : 'button-outline'}`}
                  onClick={() => setDecisionAction('reject')}
                  disabled={decisionSubmitting}
                  style={decisionAction === 'reject' ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : {}}
                >
                  Reject Requisition
                </button>
              </div>

              <label className="manage-field" htmlFor="decision-comments">
                <span>
                  {decisionAction === 'reject' ? 'Rejection Reason *' : 'Approval Comments (Optional)'}
                </span>
                <textarea
                  id="decision-comments"
                  rows={2}
                  required={decisionAction === 'reject'}
                  value={decisionComments}
                  onChange={(e) => setDecisionComments(e.target.value)}
                  disabled={decisionSubmitting}
                  placeholder={
                    decisionAction === 'reject'
                      ? 'Explain why this requisition is rejected (e.g. over budget, wrong specifications)...'
                      : 'Optional sign-off remarks or procurement guidance...'
                  }
                />
              </label>

              <div className="dialog-footer" style={{ marginTop: '20px' }}>
                <button
                  type="button"
                  className="button button-outline"
                  disabled={decisionSubmitting}
                  onClick={() => setSelectedRequest(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={decisionSubmitting}
                  style={decisionAction === 'reject' ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : {}}
                >
                  {decisionSubmitting
                    ? 'Processing...'
                    : decisionAction === 'approve'
                    ? 'Confirm Approval'
                    : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default RequisitionsPage;
