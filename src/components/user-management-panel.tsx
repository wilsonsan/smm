"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminUserRole } from "@prisma/client";
import { createPortal } from "react-dom";
import { createUserAction, deleteUserAction, updateUserAction } from "@/app/dashboard/settings/users/actions";
import { initialUserManagementFormState, type UserManagementFormState } from "@/app/dashboard/settings/users/form-state";
import { RoleBadge } from "@/components/role-badge";

type ManagedUser = {
  id: string;
  username: string;
  email: string;
  role: AdminUserRole;
  totalPosts: number;
};

type UserManagementPanelProps = {
  users: ManagedUser[];
};

function getDisplayName(user: ManagedUser) {
  return user.username || user.email;
}

function UserModal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="modal-dismiss-surface" aria-label={`Close ${title}`} onClick={onClose} />
      <div className="modal-card user-management-modal">
        <div className="preview-header">
          <div>
            <strong>{title}</strong>
            {description ? <p className="muted">{description}</p> : null}
          </div>
          <button type="button" className="ghost-link-button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function CreateUserModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState<UserManagementFormState, FormData>(
    createUserAction,
    initialUserManagementFormState,
  );

  useEffect(() => {
    if (state.success) {
      onSuccess();
    }
  }, [onSuccess, state.success]);

  return (
    <UserModal
      title="New User"
      description="Create a new app user with Admin or Creator access."
      onClose={onClose}
    >
      <form action={formAction} className="form-grid">
        <div className="grid-2">
          <div className="field">
            <label htmlFor="createUserUsername">Username</label>
            <input id="createUserUsername" name="username" />
            {state.fieldErrors?.username ? <p className="error-text">{state.fieldErrors.username[0]}</p> : null}
          </div>
          <div className="field">
            <label htmlFor="createUserEmail">Email</label>
            <input id="createUserEmail" name="email" type="email" />
            {state.fieldErrors?.email ? <p className="error-text">{state.fieldErrors.email[0]}</p> : null}
          </div>
          <div className="field">
            <label htmlFor="createUserRole">Role</label>
            <select id="createUserRole" name="role" defaultValue={AdminUserRole.CREATOR}>
              <option value={AdminUserRole.ADMIN}>Admin</option>
              <option value={AdminUserRole.CREATOR}>Creator</option>
            </select>
            {state.fieldErrors?.role ? <p className="error-text">{state.fieldErrors.role[0]}</p> : null}
          </div>
        </div>

        <div className="field">
          <label htmlFor="createUserPassword">Password</label>
          <input id="createUserPassword" name="password" type="password" autoComplete="new-password" />
          {state.fieldErrors?.password ? <p className="error-text">{state.fieldErrors.password[0]}</p> : null}
        </div>

        {state.message ? (
          <p className={state.success ? "success-text" : "error-text"}>{state.message}</p>
        ) : null}

        <div className="user-management-modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={isPending}>
            {isPending ? "Saving..." : "Create User"}
          </button>
        </div>
      </form>
    </UserModal>
  );
}

function EditUserModal({
  user,
  onClose,
  onSuccess,
}: {
  user: ManagedUser;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState<UserManagementFormState, FormData>(
    updateUserAction,
    initialUserManagementFormState,
  );
  const [deleteState, deleteAction, isDeletePending] = useActionState<UserManagementFormState, FormData>(
    deleteUserAction,
    initialUserManagementFormState,
  );
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);

  useEffect(() => {
    if (state.success) {
      onSuccess();
    }
  }, [onSuccess, state.success]);

  useEffect(() => {
    if (deleteState.success) {
      onSuccess();
    }
  }, [deleteState.success, onSuccess]);

  return (
    <UserModal title={`Edit ${getDisplayName(user)}`} description="Update email, password, or role." onClose={onClose}>
      <form action={formAction} className="form-grid">
        <input type="hidden" name="userId" value={user.id} />

        <div className="field">
          <label htmlFor={`editUserUsername-${user.id}`}>Username</label>
          <input id={`editUserUsername-${user.id}`} name="username" type="text" defaultValue={user.username} />
          {state.fieldErrors?.username ? <p className="error-text">{state.fieldErrors.username[0]}</p> : null}
        </div>

        <div className="field">
          <label htmlFor={`editUserEmail-${user.id}`}>Email</label>
          <input id={`editUserEmail-${user.id}`} name="email" type="email" defaultValue={user.email} />
          {state.fieldErrors?.email ? <p className="error-text">{state.fieldErrors.email[0]}</p> : null}
        </div>

        <div className="field">
          <label htmlFor={`editUserRole-${user.id}`}>Role</label>
          <select id={`editUserRole-${user.id}`} name="role" defaultValue={user.role}>
            <option value={AdminUserRole.ADMIN}>Admin</option>
            <option value={AdminUserRole.CREATOR}>Creator</option>
          </select>
          {state.fieldErrors?.role ? <p className="error-text">{state.fieldErrors.role[0]}</p> : null}
        </div>

        <div className="field">
          <label htmlFor={`editUserPassword-${user.id}`}>Password</label>
          <input
            id={`editUserPassword-${user.id}`}
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Leave blank to keep unchanged"
          />
          <span className="hint">Leave blank to keep the current password.</span>
          {state.fieldErrors?.password ? <p className="error-text">{state.fieldErrors.password[0]}</p> : null}
        </div>

        {state.message ? (
          <p className={state.success ? "success-text" : "error-text"}>{state.message}</p>
        ) : null}
        {deleteState.message ? (
          <p className={deleteState.success ? "success-text" : "error-text"}>{deleteState.message}</p>
        ) : null}

        <div className="user-management-modal-actions">
          <div className="user-management-modal-actions-left">
            {isDeleteConfirming ? (
              <button type="submit" formAction={deleteAction} className="danger-button" disabled={isDeletePending}>
                {isDeletePending ? "Deleting..." : "Confirm Delete"}
              </button>
            ) : (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setIsDeleteConfirming(true)}
                disabled={isPending || isDeletePending}
              >
                Delete User
              </button>
            )}
          </div>
          <div className="user-management-modal-actions-right">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={isPending || isDeletePending}>
              {isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </form>
    </UserModal>
  );
}

export function UserManagementPanel({ users }: UserManagementPanelProps) {
  const router = useRouter();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const editingUser = useMemo(
    () => users.find((user) => user.id === editingUserId) ?? null,
    [editingUserId, users],
  );

  return (
    <>
      <section className="panel user-management-panel">
        <div className="panel-body section-stack">
          <div className="user-management-toolbar">
            <div>
              <h3>Users</h3>
            </div>
            <button type="button" className="primary-button" onClick={() => setIsCreateModalOpen(true)}>
              New User
            </button>
          </div>

          <div className="table-wrap dashboard-table-wrap">
            <table className="dashboard-modern-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Total Posts</th>
                  <th>Role</th>
                  <th>Edit</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      No users yet.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="user-management-user-cell">
                          <strong>{getDisplayName(user)}</strong>
                          <span>{user.email}</span>
                        </div>
                      </td>
                      <td>{user.totalPosts}</td>
                      <td>
                        <RoleBadge role={user.role} />
                      </td>
                      <td>
                        <button type="button" className="secondary-button" onClick={() => setEditingUserId(user.id)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {isCreateModalOpen ? (
        <CreateUserModal
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            router.refresh();
          }}
        />
      ) : null}

      {editingUser ? (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUserId(null)}
          onSuccess={() => {
            setEditingUserId(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
