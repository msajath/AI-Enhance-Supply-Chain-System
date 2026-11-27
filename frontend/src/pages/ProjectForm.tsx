import React, { useEffect, useRef, useState } from 'react';
import {
  createProject,
  createSite,
  updateProject,
  updateSite,
  fetchProjects,
  isCanceled,
  type Project,
  type Site,
  type CreateProjectInput,
  type CreateSiteInput,
} from '../services/organization';
import { ApiError } from '../services/apiError';
import axios from 'axios';

type ProjectStatus = 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
type SiteStatus = 'ACTIVE' | 'INACTIVE' | 'CLOSED';

const PROJECT_STATUSES: ProjectStatus[] = [
  'ACTIVE',
  'PLANNED',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
];

const SITE_STATUSES: SiteStatus[] = [
  'ACTIVE',
  'INACTIVE',
  'CLOSED',
];

function getFormErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; error?: string } | undefined;
    if (data?.message) return data.message;
    if (data?.error) return data.error;
    if (error.response?.status === 403) return 'You do not have permission to perform this action.';
    if (error.response?.status === 401) return 'Session expired. Please sign in again.';
    if (!error.response) return 'Network error. Please check your connection and try again.';
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

export interface ProjectFormProps {
  initialData?: Partial<Project>;
  onSuccess?: (project: Project) => void;
  onCancel?: () => void;
  isModal?: boolean;
}

export function ProjectForm({ initialData, onSuccess, onCancel, isModal = false }: ProjectFormProps) {
  const [code, setCode] = useState(initialData?.code ?? '');
  const [name, setName] = useState(initialData?.name ?? '');
  const [status, setStatus] = useState<ProjectStatus>(
    (initialData?.status as ProjectStatus) || 'ACTIVE'
  );
  const [startDate, setStartDate] = useState(initialData?.startDate?.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(initialData?.endDate?.slice(0, 10) ?? '');
  const [errors, setErrors] = useState<{ code?: string; name?: string; dates?: string }>({});
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  const isEditing = Boolean(initialData?.id);

  const validate = (): boolean => {
    const errs: { code?: string; name?: string; dates?: string } = {};
    if (!code.trim()) errs.code = 'Project code is required.';
    if (!name.trim()) errs.name = 'Project name is required.';
    if (startDate && endDate && endDate < startDate) {
      errs.dates = 'Project end date cannot precede its start date.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    setFormError('');
    setSuccessMessage('');

    if (!validate()) return;

    submitting.current = true;
    setLoading(true);

    try {
      const payload: CreateProjectInput = {
        code: code.trim(),
        name: name.trim(),
        status,
        start_date: startDate ? startDate : null,
        end_date: endDate ? endDate : null,
      };

      let result: Project;
      if (isEditing && initialData?.id) {
        result = await updateProject(initialData.id, payload);
        setSuccessMessage('Project updated successfully.');
      } else {
        result = await createProject(payload);
        setSuccessMessage('Project created successfully.');
        if (!isModal) {
          setCode('');
          setName('');
          setStatus('ACTIVE');
          setStartDate('');
          setEndDate('');
        }
      }
      onSuccess?.(result);
    } catch (err) {
      setFormError(getFormErrorMessage(err, 'Failed to save project. Please check the details and try again.'));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <form className="manage-form-container" onSubmit={handleSubmit} noValidate aria-busy={loading}>
      {successMessage && <div className="manage-success" role="status">{successMessage}</div>}
      {formError && <div className="manage-error" role="alert">{formError}</div>}

      <div className="manage-form-grid">
        <label className="manage-field" htmlFor="project-code">
          <span>Project Code *</span>
          <input
            id="project-code"
            type="text"
            required
            disabled={loading}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (errors.code) setErrors((prev) => ({ ...prev, code: undefined }));
            }}
            placeholder="e.g. PRJ-CMB-01"
            aria-invalid={Boolean(errors.code)}
            aria-describedby={errors.code ? 'project-code-error' : undefined}
          />
          {errors.code && <small id="project-code-error" className="field-error">{errors.code}</small>}
        </label>

        <label className="manage-field" htmlFor="project-name">
          <span>Project Name *</span>
          <input
            id="project-name"
            type="text"
            required
            disabled={loading}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            placeholder="e.g. Colombo Commercial Center"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'project-name-error' : undefined}
          />
          {errors.name && <small id="project-name-error" className="field-error">{errors.name}</small>}
        </label>

        <label className="manage-field" htmlFor="project-status">
          <span>Status *</span>
          <select
            id="project-status"
            disabled={loading}
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        <label className="manage-field" htmlFor="project-start-date">
          <span>Start Date</span>
          <input
            id="project-start-date"
            type="date"
            disabled={loading}
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (errors.dates) setErrors((prev) => ({ ...prev, dates: undefined }));
            }}
          />
        </label>

        <label className="manage-field" htmlFor="project-end-date">
          <span>End Date</span>
          <input
            id="project-end-date"
            type="date"
            disabled={loading}
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              if (errors.dates) setErrors((prev) => ({ ...prev, dates: undefined }));
            }}
            aria-invalid={Boolean(errors.dates)}
            aria-describedby={errors.dates ? 'project-dates-error' : undefined}
          />
          {errors.dates && <small id="project-dates-error" className="field-error">{errors.dates}</small>}
        </label>
      </div>

      <div className="dialog-footer" style={{ marginTop: '20px' }}>
        {onCancel && (
          <button
            type="button"
            className="button button-outline"
            disabled={loading}
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="button button-primary"
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Saving...
            </>
          ) : isEditing ? 'Update Project' : 'Create Project'}
        </button>
      </div>
    </form>
  );
}

export interface SiteFormProps {
  initialData?: Partial<Site>;
  fixedProjectId?: string;
  projects?: Project[];
  onSuccess?: (site: Site) => void;
  onCancel?: () => void;
  isModal?: boolean;
}

export function SiteForm({ initialData, fixedProjectId, projects: propProjects, onSuccess, onCancel, isModal = false }: SiteFormProps) {
  const [projectId, setProjectId] = useState(fixedProjectId || initialData?.projectId || '');
  const [code, setCode] = useState(initialData?.code ?? '');
  const [name, setName] = useState(initialData?.name ?? '');
  const [address, setAddress] = useState(initialData?.address ?? '');
  const [status, setStatus] = useState<SiteStatus>(
    (initialData?.status as SiteStatus) || 'ACTIVE'
  );
  const [availableProjects, setAvailableProjects] = useState<Project[]>(propProjects ?? []);
  const [loadingProjects, setLoadingProjects] = useState(!propProjects);
  const [errors, setErrors] = useState<{ projectId?: string; code?: string; name?: string }>({});
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  const isEditing = Boolean(initialData?.id);

  useEffect(() => {
    if (propProjects) {
      setAvailableProjects(propProjects);
      return;
    }
    const controller = new AbortController();
    setLoadingProjects(true);
    fetchProjects(controller.signal)
      .then(({ projects }) => {
        setAvailableProjects(projects);
        setProjectId((current) => {
          if (!current && projects.length > 0 && !fixedProjectId) {
            return projects[0].id;
          }
          return current;
        });
      })
      .catch((err) => {
        if (!isCanceled(err)) {
          setFormError('Could not load accessible projects. Please check your connection.');
        }
      })
      .finally(() => setLoadingProjects(false));

    return () => controller.abort();
  }, [propProjects, fixedProjectId]);

  const validate = (): boolean => {
    const errs: { projectId?: string; code?: string; name?: string } = {};
    if (!projectId) errs.projectId = 'Parent project is required.';
    if (!code.trim()) errs.code = 'Site code is required.';
    if (!name.trim()) errs.name = 'Site name is required.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    setFormError('');
    setSuccessMessage('');

    if (!validate()) return;

    submitting.current = true;
    setLoading(true);

    try {
      const payload: CreateSiteInput = {
        project_id: projectId,
        code: code.trim(),
        name: name.trim(),
        address: address.trim() || null,
        status,
      };

      let result: Site;
      if (isEditing && initialData?.id) {
        result = await updateSite(initialData.id, payload);
        setSuccessMessage('Site updated successfully.');
      } else {
        result = await createSite(payload);
        setSuccessMessage('Site created successfully.');
        if (!isModal) {
          setCode('');
          setName('');
          setAddress('');
          setStatus('ACTIVE');
        }
      }
      onSuccess?.(result);
    } catch (err) {
      setFormError(getFormErrorMessage(err, 'Failed to save site. Please verify the parent project and details.'));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <form className="manage-form-container" onSubmit={handleSubmit} noValidate aria-busy={loading}>
      {successMessage && <div className="manage-success" role="status">{successMessage}</div>}
      {formError && <div className="manage-error" role="alert">{formError}</div>}

      <div className="manage-form-grid">
        <label className="manage-field" htmlFor="site-project">
          <span>Parent Project *</span>
          <select
            id="site-project"
            disabled={loading || Boolean(fixedProjectId) || loadingProjects}
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              if (errors.projectId) setErrors((prev) => ({ ...prev, projectId: undefined }));
            }}
            aria-invalid={Boolean(errors.projectId)}
            aria-describedby={errors.projectId ? 'site-project-error' : undefined}
          >
            <option value="">{loadingProjects ? 'Loading projects...' : 'Select parent project'}</option>
            {availableProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
          {errors.projectId && <small id="site-project-error" className="field-error">{errors.projectId}</small>}
        </label>

        <label className="manage-field" htmlFor="site-code">
          <span>Site Code *</span>
          <input
            id="site-code"
            type="text"
            required
            disabled={loading}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (errors.code) setErrors((prev) => ({ ...prev, code: undefined }));
            }}
            placeholder="e.g. CMB-FDN"
            aria-invalid={Boolean(errors.code)}
            aria-describedby={errors.code ? 'site-code-error' : undefined}
          />
          {errors.code && <small id="site-code-error" className="field-error">{errors.code}</small>}
        </label>

        <label className="manage-field" htmlFor="site-name">
          <span>Site Name *</span>
          <input
            id="site-name"
            type="text"
            required
            disabled={loading}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            placeholder="e.g. Foundation Works"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'site-name-error' : undefined}
          />
          {errors.name && <small id="site-name-error" className="field-error">{errors.name}</small>}
        </label>

        <label className="manage-field" htmlFor="site-status">
          <span>Status *</span>
          <select
            id="site-status"
            disabled={loading}
            value={status}
            onChange={(e) => setStatus(e.target.value as SiteStatus)}
          >
            {SITE_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        <label className="manage-field field-wide" htmlFor="site-address">
          <span>Site Address / Location</span>
          <textarea
            id="site-address"
            rows={2}
            disabled={loading}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. Colombo 01, Sri Lanka"
          />
        </label>
      </div>

      <div className="dialog-footer" style={{ marginTop: '20px' }}>
        {onCancel && (
          <button
            type="button"
            className="button button-outline"
            disabled={loading}
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="button button-primary"
          disabled={loading || (loadingProjects && !fixedProjectId)}
        >
          {loading ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Saving...
            </>
          ) : isEditing ? 'Update Site' : 'Create Site'}
        </button>
      </div>
    </form>
  );
}

export function ProjectFormModal({
  initialData,
  onClose,
  onSuccess,
}: {
  initialData?: Partial<Project>;
  onClose: () => void;
  onSuccess?: (project: Project) => void;
}) {
  return (
    <div className="scrim" onClick={onClose} role="presentation">
      <div
        className="manage-dialog"
        role="dialog"
        aria-labelledby="modal-project-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-heading">
          <h2 id="modal-project-title">{initialData?.id ? 'Edit Project' : 'Create New Project'}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>
        <ProjectForm
          initialData={initialData}
          isModal
          onCancel={onClose}
          onSuccess={(p) => {
            onSuccess?.(p);
            onClose();
          }}
        />
      </div>
    </div>
  );
}

export function SiteFormModal({
  initialData,
  fixedProjectId,
  projects,
  onClose,
  onSuccess,
}: {
  initialData?: Partial<Site>;
  fixedProjectId?: string;
  projects?: Project[];
  onClose: () => void;
  onSuccess?: (site: Site) => void;
}) {
  return (
    <div className="scrim" onClick={onClose} role="presentation">
      <div
        className="manage-dialog"
        role="dialog"
        aria-labelledby="modal-site-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-heading">
          <h2 id="modal-site-title">{initialData?.id ? 'Edit Site' : 'Create New Site'}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>
        <SiteForm
          initialData={initialData}
          fixedProjectId={fixedProjectId}
          projects={projects}
          isModal
          onCancel={onClose}
          onSuccess={(s) => {
            onSuccess?.(s);
            onClose();
          }}
        />
      </div>
    </div>
  );
}

export default function ProjectManagementPage() {
  const [tab, setTab] = useState<'project' | 'site'>('project');

  return (
    <section className="manage-resource">
      <div className="page-heading">
        <div>
          <div className="eyebrow">PROJECT & SITE MANAGEMENT</div>
          <h1>{tab === 'project' ? 'New Project' : 'New Site'}</h1>
          <p>
            Create construction projects and define working sites within authorized organizational scope.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={`button ${tab === 'project' ? 'button-primary' : 'button-outline'}`}
            onClick={() => setTab('project')}
          >
            Project Form
          </button>
          <button
            type="button"
            className={`button ${tab === 'site' ? 'button-primary' : 'button-outline'}`}
            onClick={() => setTab('site')}
          >
            Site Form
          </button>
        </div>
      </div>

      <div className="panel" style={{ padding: '24px', maxWidth: '720px' }}>
        {tab === 'project' ? <ProjectForm /> : <SiteForm />}
      </div>
    </section>
  );
}
