
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { DataTable, Modal } from './Management';
import {
  read,
  write,
  errorMessage,
  type Row,
} from '../services/management';

type RoleRecord = Row & {
  name: string;
  description?: string | null;
  permissions: string[];
};

type UserRecord = Row & {
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
};

function friendlyError(error: unknown): string {
  const candidate = error as {
    status?: number;
    response?: { status?: number };
  } | null;

  const status = candidate?.response?.status ?? candidate?.status;

  if (status === 401) {
    return 'Your session has expired. Please sign in again.';
  }

  if (status === 403) {
    return 'Access denied. You do not have permission to perform this action.';
  }

  return errorMessage(error);
}

export function AdminRolesPage({
  currentUserId,
  canUpdate,
}: {
  currentUserId: string;
  canUpdate: boolean;
}) {
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');

  const [target, setTarget] = useState<UserRecord | null>(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setLoadError('');

    Promise.all([
      read<{ rows: RoleRecord[] }>('admin/roles'),
      read<{ rows: UserRecord[] }>('admin/users'),
    ])
      .then(([roleData, userData]) => {
        if (!active) return;

        setRoles(roleData.rows);
        setUsers(userData.rows);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(friendlyError(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [revision]);

  const roleName = (code: string) =>
    roles.find((role) => role.id === code)?.name ?? code;

  const filteredUsers = users.filter((user) => {
    const text = `${user.full_name} ${user.email} ${user.role}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const tableRows: Row[] = filteredUsers.map((user) => ({
    ...user,
    role_name: roleName(user.role),
  }));

  function openRoleEditor(user: UserRecord) {
    if (!canUpdate || user.id === currentUserId) return;

    setSaveError('');
    setMessage('');
    setTarget(user);
    setSelectedRole(user.role);
  }

  function closeRoleEditor() {
    if (saving) return;
    setTarget(null);
    setSaveError('');
  }

  async function confirmRoleChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!target || !canUpdate || inFlight.current) return;
    if (target.id === currentUserId) return;

    if (!roles.some((role) => role.id === selectedRole)) {
      setSaveError('Choose an available role.');
      return;
    }

    if (selectedRole === target.role) {
      setSaveError('Choose a different role before confirming.');
      return;
    }

    inFlight.current = true;
    setSaving(true);
    setSaveError('');

    try {
      await write(
        `admin/users/${encodeURIComponent(target.id)}`,
        { role: selectedRole },
        'patch',
      );

      setMessage(
        `Role change confirmed for ${target.full_name}. Existing sessions will be revoked by the backend.`,
      );
      setTarget(null);
      setRevision((value) => value + 1);
    } catch (error) {
      setSaveError(friendlyError(error));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="manage-resource">
      <div className="page-heading">
        <div>
          <div className="eyebrow">SECURITY ADMINISTRATION</div>
          <h1>Roles &amp; Permissions</h1>
          <p>
            View existing role policies and manage authorized user-role
            assignments.
          </p>
        </div>
        <button
          type="button"
          className="button button-outline"
          onClick={() => setRevision((value) => value + 1)}
        >
          Refresh
        </button>
      </div>

      <div className="panel">
        <p className="manage-help">
          <strong>Security policy:</strong> Permissions are defined and enforced
          by the backend. This page can assign existing roles but cannot
          modify their permission definitions.
        </p>

        <p className="manage-help">
          To grant or revoke project, site and warehouse access, use{' '}
          <Link to="/admin/users">Users &gt; Access</Link>.
        </p>

        {!canUpdate && (
          <p className="manage-help">
            You have read-only access to role information.
          </p>
        )}
      </div>

      {message && (
        <p className="manage-success" role="status">
          {message}
        </p>
      )}

      {loadError && (
        <div className="manage-error" role="alert">
          {loadError}{' '}
          <button
            type="button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <p className="org-state" role="status">
          Loading roles and users...
        </p>
      ) : !loadError ? (
        <>
          <div className="page-heading">
            <div>
              <h2>Available roles</h2>
              <p>Permissions are read directly from the administration API.</p>
            </div>
          </div>

          {roles.length === 0 ? (
            <p className="org-state" role="status">
              No roles are configured for this organization.
            </p>
          ) : (
            <div className="permission-grid">
              {roles.map((role) => (
                <article className="panel permission-card" key={role.id}>
                  <h2>{role.name}</h2>

                  {role.description && <p>{role.description}</p>}

                  <p className="manage-help">
                    {users.filter((user) => user.role === role.id).length}{' '}
                    assigned user(s)
                  </p>

                  <ul>
                    {(role.permissions ?? []).map((permission) => (
                      <li key={permission}>{permission}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}

          <div className="page-heading">
            <div>
              <h2>User role assignments</h2>
              <p>
                Changes are saved through the existing secured backend API.
              </p>
            </div>
          </div>

          <div className="panel">
            <div className="manage-toolbar">
              <label className="manage-search">
                <span>Search users</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, email or role..."
                />
              </label>
            </div>

            <DataTable
              rows={tableRows}
              columns={['full_name', 'email', 'role_name', 'is_active']}
              actions={(row) => {
                const account = row as UserRecord;
                const self = account.id === currentUserId;

                return (
                  <button
                    type="button"
                    className="text-button"
                    disabled={!canUpdate || self || roles.length === 0}
                    title={
                      self
                        ? 'You cannot change your own role'
                        : !canUpdate
                          ? 'You do not have permission to update users'
                          : 'Change user role'
                    }
                    onClick={() => openRoleEditor(account)}
                  >
                    Change role
                  </button>
                );
              }}
            />
          </div>
        </>
      ) : null}

      {target && (
        <Modal
          title="Confirm role assignment"
          onClose={closeRoleEditor}
        >
          <form onSubmit={confirmRoleChange}>
            <p className="manage-help">
              Change <strong>{target.full_name}</strong> from{' '}
              <strong>{roleName(target.role)}</strong> to another role.
              This replaces the previous role and the backend revokes
              existing sessions after the update.
            </p>

            <label className="manage-field">
              <span>New role</span>
              <select
                required
                value={selectedRole}
                disabled={saving}
                onChange={(event) => setSelectedRole(event.target.value)}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>

            {saveError && (
              <p className="manage-error" role="alert">
                {saveError}
              </p>
            )}

            <div className="dialog-footer">
              <button
                type="button"
                className="button button-outline"
                disabled={saving}
                onClick={closeRoleEditor}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="button button-primary"
                disabled={
                  saving ||
                  selectedRole === target.role ||
                  !roles.some((role) => role.id === selectedRole)
                }
              >
                {saving ? 'Saving...' : 'Confirm role change'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
