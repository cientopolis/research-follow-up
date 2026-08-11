import React, { useEffect, useState } from 'react';

interface UserAccount {
  uid: string;
  email?: string;
  disabled: boolean;
  customClaims: { admin?: boolean; superadmin?: boolean };
  metadata: { creationTime?: string; lastSignInTime?: string };
}

interface AdminUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
  currentUid: string;
}

export const AdminUsersModal: React.FC<AdminUsersModalProps> = ({
  isOpen,
  onClose,
  fetchWithAuth,
  currentUid,
}) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Reset password state
  const [resetTargetUid, setResetTargetUid] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/admin/users');
      const data = await res.json();
      if (res.ok && data.users) {
        setUsers(data.users);
      } else {
        setError(data.error || 'Error al cargar usuarios');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDeleteUser = async (uid: string, email?: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente al usuario ${email || uid}?`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth(`/api/admin/users/${uid}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Usuario ${email || uid} eliminado correctamente.`);
        loadUsers();
      } else {
        setError(data.error || 'Error al eliminar usuario');
      }
    } catch (err: any) {
      setError(err.message || 'Error al eliminar');
    }
  };

  const handleResetPassword = async (uid: string) => {
    if (!newPassword || newPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth(`/api/admin/users/${uid}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Contraseña blanqueada y actualizada exitosamente.');
        setResetTargetUid(null);
        setNewPassword('');
      } else {
        setError(data.error || 'Error al actualizar contraseña');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    }
  };

  const handleToggleAdmin = async (uid: string, currentAdmin: boolean) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth(`/api/admin/users/${uid}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAdmin: !currentAdmin }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Rol actualizado correctamente.`);
        loadUsers();
      } else {
        setError(data.error || 'Error al actualizar rol');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100, background: 'rgba(0,0,0,0.65)' }} onClick={onClose}>
      <div
        style={{
          width: '780px',
          maxWidth: '92vw',
          maxHeight: '85vh',
          background: 'var(--bg-surface)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            background: 'var(--bg-mantle)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>👑</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Gestión de Super Usuario (Usuarios del Sistema)
              </h3>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Administrá las cuentas de usuario, blanqueá contraseñas y asigná permisos.
              </span>
            </div>
          </div>
          <button className="btn" onClick={onClose}>✕ Cerrar</button>
        </div>

        {/* Alerts */}
        {error && (
          <div style={{ padding: '10px 24px', background: 'rgba(220,38,38,0.15)', color: '#dc2626', fontSize: '0.8rem', fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}
        {success && (
          <div style={{ padding: '10px 24px', background: 'rgba(22,163,74,0.15)', color: '#16a34a', fontSize: '0.8rem', fontWeight: 600 }}>
            ✅ {success}
          </div>
        )}

        {/* Content Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {loading ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
              ⏳ Cargando usuarios registrados...
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '8px' }}>Usuario / Email</th>
                  <th style={{ padding: '8px' }}>Rol</th>
                  <th style={{ padding: '8px' }}>UID</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isAdmin = !!(u.customClaims?.admin || u.customClaims?.superadmin || u.email?.startsWith('admin@') || u.email?.startsWith('superadmin@'));
                  const isCurrent = u.uid === currentUid;

                  return (
                    <tr key={u.uid} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s' }}>
                      <td style={{ padding: '12px 8px', fontWeight: 600, color: 'var(--text-main)' }}>
                        {u.email || 'Sin Email'}
                        {isCurrent && (
                          <span style={{ marginLeft: '6px', fontSize: '0.65rem', background: '#1e66f5', color: '#fff', padding: '2px 6px', borderRadius: '4px' }}>
                            Tu cuenta
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            background: isAdmin ? 'rgba(124,58,237,0.15)' : 'rgba(100,116,139,0.12)',
                            color: isAdmin ? '#7c3aed' : '#64748b',
                          }}
                        >
                          {isAdmin ? '👑 Super Admin' : '👤 Usuario'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px', fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {u.uid}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                          {/* Reset Password Button */}
                          <button
                            className="btn"
                            style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                            onClick={() => {
                              setResetTargetUid(resetTargetUid === u.uid ? null : u.uid);
                              setNewPassword('');
                            }}
                            title="Blanquear o cambiar contraseña"
                          >
                            🔑 Blanquear Clave
                          </button>

                          {/* Toggle Admin Role */}
                          {!isCurrent && (
                            <button
                              className="btn"
                              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                              onClick={() => handleToggleAdmin(u.uid, isAdmin)}
                              title={isAdmin ? 'Quitar rol de admin' : 'Hacer Super Admin'}
                            >
                              {isAdmin ? '⬇ Quitar Admin' : '👑 Hacer Admin'}
                            </button>
                          )}

                          {/* Delete User Button */}
                          {!isCurrent && (
                            <button
                              className="btn"
                              style={{ fontSize: '0.75rem', padding: '4px 10px', color: '#dc2626', borderColor: 'rgba(220,38,38,0.3)' }}
                              onClick={() => handleDeleteUser(u.uid, u.email)}
                              title="Borrar usuario"
                            >
                              🗑️ Borrar
                            </button>
                          )}
                        </div>

                        {/* Expandable Reset Password Box */}
                        {resetTargetUid === u.uid && (
                          <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg-mantle)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <input
                              type="password"
                              placeholder="Nueva clave (min 6 carácteres)"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.78rem' }}
                            />
                            <button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => handleResetPassword(u.uid)}>
                              Guardar Clave
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
