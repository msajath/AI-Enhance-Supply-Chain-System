
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DataTable, Modal } from './Management';
import type { Row } from '../services/management';

type Tab = 'companies' | 'departments';

type Company = Row & {
  code: string;
  name: string;
  address: string;
};

type Department = Row & {
  company_id: string;
  code: string;
  name: string;
};

type OrgForm = {
  code: string;
  name: string;
  address: string;
  company_id: string;
};

const blankForm: OrgForm = {
  code: '',
  name: '',
  address: '',
  company_id: '',
};

export function AdminOrganizationPage({
  organization,
}: {
  organization: Row;
}) {
  const [tab, setTab] = useState<Tab>('companies');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [editor, setEditor] = useState<{ tab: Tab; id?: string } | null>(null);
  const [form, setForm] = useState<OrgForm>(blankForm);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const sequence = useRef(1);

  const orgId = String(organization.id ?? '');
  const orgCode = String(organization.code ?? 'CURRENT');
  const orgName = String(organization.name ?? 'Current company');
  const orgAddress = String(organization.address ?? '');

  useEffect(() => {
    if (!orgId) return;

    setCompanies((previous) => {
      if (previous.some((company) => company.id === orgId)) {
        return previous;
      }

      return [
        {
          id: orgId,
          code: orgCode,
          name: orgName,
          address: orgAddress,
        },
        ...previous,
      ];
    });
  }, [orgId, orgCode, orgName, orgAddress]);

  function updateField(key: keyof OrgForm, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function openEditor(row?: Row) {
    setError('');
    setMessage('');
    setEditor({ tab, id: row?.id });

    setForm({
      code: String(row?.code ?? ''),
      name: String(row?.name ?? ''),
      address: String(row?.address ?? ''),
      company_id: String(row?.company_id ?? companies[0]?.id ?? ''),
    });
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;

    setError('');

    const code = form.code.trim().toUpperCase();
    const name = form.name.trim();

    if (!/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(code)) {
      setError('Code must contain 2–20 letters, numbers, hyphens or underscores.');
      return;
    }

    if (name.length < 2 || name.length > 100) {
      setError('Name must contain between 2 and 100 characters.');
      return;
    }

    const id = editor.id ?? `demo-${sequence.current++}`;

    if (editor.tab === 'companies') {
      const duplicate = companies.some(
        (company) => company.id !== editor.id &&
          company.code.toUpperCase() === code
      );

      if (duplicate) {
        setError('This company code already exists in the demo.');
        return;
      }

      const record: Company = {
        id,
        code,
        name,
        address: form.address.trim(),
      };

      setCompanies((previous) =>
        editor.id
          ? previous.map((company) => company.id === editor.id ? record : company)
          : [...previous, record]
      );
    } else {
      if (!companies.some((company) => company.id === form.company_id)) {
        setError('Select a valid company.');
        return;
      }

      const duplicate = departments.some(
        (department) =>
          department.id !== editor.id &&
          department.company_id === form.company_id &&
          department.code.toUpperCase() === code
      );

      if (duplicate) {
        setError('This department code already exists for the selected company.');
        return;
      }

      const record: Department = {
        id,
        company_id: form.company_id,
        code,
        name,
      };

      setDepartments((previous) =>
        editor.id
          ? previous.map((department) =>
              department.id === editor.id ? record : department
            )
          : [...previous, record]
      );
    }

    setEditor(null);
    setForm(blankForm);
    setMessage('Demo record saved in memory only. No database changes were made.');
  }

  const rows: Row[] = tab === 'companies'
    ? companies
    : departments.map((department) => ({
        ...department,
        company_name: companies.find(
          (company) => company.id === department.company_id
        )?.name ?? 'Unknown company',
      }));

  return (
    <section className="manage-resource" aria-label="Company and department administration">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ENTERPRISE ADMINISTRATION</div>
          <h1>Companies &amp; Departments</h1>
          <p>Manage company and department records in the administration workspace.</p>
        </div>
      </div>

      <div className="panel">
        <p className="manage-help" role="note">
          <strong>Frontend demonstration mode.</strong> Company and department
          changes are temporary, are not saved to PostgreSQL, and disappear
          after a page reload. Backend integration is pending.
        </p>
      </div>

      <div className="panel">
        <div className="manage-toolbar">
          <div>
            <button
              type="button"
              className={`button ${tab === 'companies' ? 'button-primary' : 'button-outline'}`}
              aria-pressed={tab === 'companies'}
              onClick={() => { setTab('companies'); setMessage(''); }}
            >
              Companies
            </button>{' '}
            <button
              type="button"
              className={`button ${tab === 'departments' ? 'button-primary' : 'button-outline'}`}
              aria-pressed={tab === 'departments'}
              onClick={() => { setTab('departments'); setMessage(''); }}
            >
              Departments
            </button>
          </div>

          <button
            type="button"
            className="button button-primary"
            disabled={tab === 'departments' && companies.length === 0}
            onClick={() => openEditor()}
          >
            Create {tab === 'companies' ? 'company' : 'department'}
          </button>
        </div>

        {message && <p role="status" className="manage-success">{message}</p>}

        <DataTable
          rows={rows}
          columns={tab === 'companies'
            ? ['code', 'name', 'address']
            : ['code', 'name', 'company_name']}
          actions={(row) => (
            <button
              type="button"
              className="text-button"
              onClick={() => openEditor(row)}
            >
              Edit
            </button>
          )}
        />
      </div>

      {editor && (
        <Modal
          title={`${editor.id ? 'Edit' : 'Create'} ${editor.tab === 'companies' ? 'company' : 'department'}`}
          onClose={() => { setEditor(null); setError(''); }}
        >
          <form onSubmit={save} noValidate>
            <div className="manage-form-grid">
              {editor.tab === 'departments' && (
                <label className="manage-field">
                  <span>Company</span>
                  <select
                    required
                    value={form.company_id}
                    onChange={(event) => updateField('company_id', event.target.value)}
                  >
                    <option value="">Select a company</option>
                    {companies.map((company) => (
                      <option value={company.id} key={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="manage-field">
                <span>{editor.tab === 'companies' ? 'Company code' : 'Department code'}</span>
                <input
                  required
                  maxLength={20}
                  value={form.code}
                  onChange={(event) => updateField('code', event.target.value)}
                />
              </label>

              <label className="manage-field">
                <span>{editor.tab === 'companies' ? 'Company name' : 'Department name'}</span>
                <input
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                />
              </label>

              {editor.tab === 'companies' && (
                <label className="manage-field">
                  <span>Address</span>
                  <textarea
                    maxLength={500}
                    value={form.address}
                    onChange={(event) => updateField('address', event.target.value)}
                  />
                </label>
              )}
            </div>

            {error && <p className="manage-error" role="alert">{error}</p>}

            <div className="dialog-footer">
              <button
                type="button"
                className="button button-outline"
                onClick={() => { setEditor(null); setError(''); }}
              >
                Cancel
              </button>
              <button type="submit" className="button button-primary">
                Save demo record
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
