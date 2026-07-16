'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  api,
  appendFormFields,
  getStoredUser,
  uploadFiles,
} from '@/lib/api';
import { ROLE_LABELS, USER_STATUS_LABELS, isAdminRole } from '@/lib/labels';
import { branchLabel } from '@/lib/branchLabel';
import {
  ALL_PERMISSION_KEYS,
  groupPermissions,
  isOfficeRole,
} from '@/lib/permissions';

type User = {
  id: string;
  login: string;
  fullName: string;
  role: string;
  status: string;
  phone?: string | null;
  telegramId?: string | null;
  hiredAt?: string | null;
  hasPassport?: boolean;
  hasEmployeePhoto?: boolean;
  city?: { id: string; name: string; cityName?: string | null } | null;
  managedCityIds?: string[];
  permissions?: string[];
};

type City = { id: string; name: string; cityName?: string | null };

type Tab = 'ACTIVE' | 'FIRED';

const emptyForm = {
  login: '',
  password: '',
  fullName: '',
  role: 'DISPATCHER',
  phone: '',
  cityId: '',
  telegramId: '',
  passportNumber: '',
  hiredAt: '',
  managedCityIds: [] as string[],
};

export function CrmUsersPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [tab, setTab] = useState<Tab>('ACTIVE');
  const [error, setError] = useState('');
  const [fireId, setFireId] = useState<string | null>(null);
  const [fireForm, setFireForm] = useState({ reason: '', recommendedHire: true });
  const [form, setForm] = useState(emptyForm);
  const [passportPhoto, setPassportPhoto] = useState<File | null>(null);
  const [contractPhoto, setContractPhoto] = useState<File | null>(null);
  const [employeePhoto, setEmployeePhoto] = useState<File | null>(null);
  const [branchEditId, setBranchEditId] = useState<string | null>(null);
  const [branchSel, setBranchSel] = useState<string[]>([]);
  const [permSel, setPermSel] = useState<string[]>([...ALL_PERMISSION_KEYS]);
  const [permEditId, setPermEditId] = useState<string | null>(null);
  const [editPermSel, setEditPermSel] = useState<string[]>([]);
  const role = getStoredUser()?.role ?? '';
  const admin = isAdminRole(role);
  const isOwner = role === 'OWNER';
  const canEditPerms = isOwner || role === 'DIRECTOR';
  const officeTarget = isOfficeRole(form.role);
  const permGroups = groupPermissions();

  const cityLabel = (id: string) => {
    const c = cities.find((x) => x.id === id);
    return c ? branchLabel(c) : id;
  };

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function load(status: Tab = tab) {
    setUsers(await api<User[]>(`/users?status=${status}`));
  }

  useEffect(() => {
    if (!admin) {
      setError('Доступно администратору');
      return;
    }
    api<City[]>('/cities')
      .then(setCities)
      .catch(() => setCities([]));
  }, [admin]);

  useEffect(() => {
    if (!admin) return;
    load(tab).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, tab]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (isOfficeRole(form.role) && permSel.length === 0) {
      setError('Выберите хотя бы одно разрешение');
      return;
    }
    try {
      const fd = appendFormFields(new FormData(), {
        login: form.login,
        password: form.password,
        fullName: form.fullName,
        role: form.role,
        phone: form.phone,
        cityId: form.cityId,
        telegramId: form.telegramId,
        passportNumber: form.passportNumber,
        hiredAt: form.hiredAt
          ? new Date(form.hiredAt).toISOString()
          : undefined,
        managedCityIds:
          form.role === 'DIRECTOR' && form.managedCityIds.length
            ? form.managedCityIds.join(',')
            : undefined,
        permissions: isOfficeRole(form.role)
          ? JSON.stringify(permSel)
          : undefined,
      });
      if (passportPhoto) fd.append('passportPhoto', passportPhoto);
      if (contractPhoto) fd.append('contractPhoto', contractPhoto);
      if (employeePhoto) fd.append('employeePhoto', employeePhoto);

      await uploadFiles('/users', fd);
      setForm(emptyForm);
      setPermSel([...ALL_PERMISSION_KEYS]);
      setPassportPhoto(null);
      setContractPhoto(null);
      setEmployeePhoto(null);
      setTab('ACTIVE');
      await load('ACTIVE');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function fireUser(id: string) {
    setError('');
    try {
      await api(`/users/${id}/fire`, {
        method: 'POST',
        body: JSON.stringify({
          reason: fireForm.reason || undefined,
          recommendedHire: fireForm.recommendedHire,
        }),
      });
      setFireId(null);
      setFireForm({ reason: '', recommendedHire: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  function startPermEdit(u: User) {
    setPermEditId(u.id);
    setEditPermSel(
      u.permissions?.length ? [...u.permissions] : [...ALL_PERMISSION_KEYS],
    );
  }

  async function savePermEdit(id: string) {
    setError('');
    if (editPermSel.length === 0) {
      setError('Выберите хотя бы одно разрешение');
      return;
    }
    try {
      await api(`/users/${id}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions: editPermSel }),
      });
      setPermEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function restoreUser(id: string) {
    setError('');
    try {
      await api(`/users/${id}/restore`, { method: 'POST', body: '{}' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function saveBranches(id: string) {
    setError('');
    try {
      await api(`/users/${id}/branches`, {
        method: 'POST',
        body: JSON.stringify({ cityIds: branchSel }),
      });
      setBranchEditId(null);
      setBranchSel([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  return (
    <div>
      {admin ? (
        <form className="panel user-form" onSubmit={onCreate}>
          <div className="user-form-head">
            <h2 className="user-form-title">Новый сотрудник</h2>
          </div>

          <div className="user-form-grid">
            <div className="field">
              <label>Логин</label>
              <input
                required
                autoComplete="off"
                value={form.login}
                onChange={(e) => setForm({ ...form, login: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Пароль</label>
              <input
                required
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="field">
              <label>ФИО</label>
              <input
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Роль</label>
              <select
                value={form.role}
                onChange={(e) => {
                  const next = e.target.value;
                  setForm({ ...form, role: next });
                  if (isOfficeRole(next)) {
                    setPermSel([...ALL_PERMISSION_KEYS]);
                  }
                }}
              >
                <option value="MASTER">Мастер</option>
                <option value="DISPATCHER">Диспетчер</option>
                <option value="ADMIN">Администратор</option>
                <option value="DIRECTOR">Директор</option>
                <option value="OWNER">Владелец</option>
              </select>
            </div>
            <div className="field">
              <label>Телефон</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Филиал назначения</label>
              <select
                value={form.cityId}
                onChange={(e) => setForm({ ...form, cityId: e.target.value })}
              >
                <option value="">Выберите филиал</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {branchLabel(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Telegram ID</label>
              <input
                value={form.telegramId}
                onChange={(e) =>
                  setForm({ ...form, telegramId: e.target.value })
                }
                placeholder="из /start в боте"
              />
            </div>
            <div className="field">
              <label>Номер паспорта</label>
              <input
                value={form.passportNumber}
                onChange={(e) =>
                  setForm({ ...form, passportNumber: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label>Дата начала работы</label>
              <input
                type="date"
                value={form.hiredAt}
                onChange={(e) => setForm({ ...form, hiredAt: e.target.value })}
              />
            </div>
          </div>

          {form.role === 'DIRECTOR' ? (
            <div className="field user-form-director">
              <label>Филиалы под управлением</label>
              <div className="user-form-checks">
                {cities.map((c) => (
                  <label key={c.id} className="user-form-check">
                    <input
                      type="checkbox"
                      checked={form.managedCityIds.includes(c.id)}
                      onChange={() =>
                        setForm({
                          ...form,
                          managedCityIds: toggle(form.managedCityIds, c.id),
                        })
                      }
                    />
                    {branchLabel(c)}
                  </label>
                ))}
                {!cities.length ? (
                  <span className="muted">Сначала добавьте филиалы</span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="user-form-files">
            <div className="field">
              <label>Фото паспорта</label>
              <label className="file-picker">
                <input
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  onChange={(e) =>
                    setPassportPhoto(e.target.files?.[0] ?? null)
                  }
                />
                <span className="file-picker-title">
                  {passportPhoto?.name ?? 'Выбрать файл'}
                </span>
                <span className="file-picker-hint">фото или PDF</span>
              </label>
            </div>
            <div className="field">
              <label>Фото договора</label>
              <label className="file-picker">
                <input
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  onChange={(e) =>
                    setContractPhoto(e.target.files?.[0] ?? null)
                  }
                />
                <span className="file-picker-title">
                  {contractPhoto?.name ?? 'Выбрать файл'}
                </span>
                <span className="file-picker-hint">фото или PDF</span>
              </label>
            </div>
            <div className="field">
              <label>Фото сотрудника</label>
              <label className="file-picker">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    setEmployeePhoto(e.target.files?.[0] ?? null)
                  }
                />
                <span className="file-picker-title">
                  {employeePhoto?.name ?? 'Выбрать файл'}
                </span>
                <span className="file-picker-hint">только фото</span>
              </label>
            </div>
          </div>

          {officeTarget ? (
            <div className="field user-form-perms">
              <div className="user-form-perms-head">
                <label>Разрешения</label>
                <div className="user-form-perms-actions">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setPermSel([...ALL_PERMISSION_KEYS])}
                  >
                    Все
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setPermSel([])}
                  >
                    Снять
                  </button>
                </div>
              </div>
              <div className="perm-grid">
                {permGroups.map(([group, items]) => (
                  <div key={group} className="perm-group">
                    <div className="perm-group-title">{group}</div>
                    {items.map((p) => (
                      <label key={p.key} className="perm-item">
                        <input
                          type="checkbox"
                          checked={permSel.includes(p.key)}
                          onChange={() => setPermSel(toggle(permSel, p.key))}
                        />
                        <span>{p.label}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <button className="btn user-form-submit" type="submit">
            Создать сотрудника
          </button>
        </form>
      ) : null}
      <div className="panel">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className={tab === 'ACTIVE' ? 'btn' : 'btn secondary'}
            onClick={() => setTab('ACTIVE')}
          >
            Активные
          </button>
          <button
            type="button"
            className={tab === 'FIRED' ? 'btn' : 'btn secondary'}
            onClick={() => setTab('FIRED')}
          >
            Уволенные
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Логин</th>
              <th>Роль</th>
              <th>Разрешения</th>
              <th>Филиалы</th>
              <th>Телефон</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.fullName}</td>
                <td>{u.login}</td>
                <td>{ROLE_LABELS[u.role] ?? u.role}</td>
                <td>
                  {!isOfficeRole(u.role) ? (
                    <span className="muted">—</span>
                  ) : permEditId === u.id ? (
                    <div style={{ minWidth: 280 }}>
                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                          marginBottom: 8,
                          flexWrap: 'wrap',
                        }}
                      >
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => setEditPermSel([...ALL_PERMISSION_KEYS])}
                        >
                          Все
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => setEditPermSel([])}
                        >
                          Снять
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => savePermEdit(u.id)}
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => setPermEditId(null)}
                        >
                          Отмена
                        </button>
                      </div>
                      <div className="perm-grid">
                        {permGroups.map(([group, items]) => (
                          <div key={group} className="perm-group">
                            <div className="perm-group-title">{group}</div>
                            {items.map((p) => (
                              <label key={p.key} className="perm-item">
                                <input
                                  type="checkbox"
                                  checked={editPermSel.includes(p.key)}
                                  onChange={() =>
                                    setEditPermSel(toggle(editPermSel, p.key))
                                  }
                                />
                                <span>{p.label}</span>
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <span>
                      <span className="muted">
                        {(u.permissions ?? []).length || 0} из{' '}
                        {ALL_PERMISSION_KEYS.length}
                      </span>
                      {canEditPerms && tab === 'ACTIVE' ? (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="btn secondary"
                            style={{ padding: '2px 8px', fontSize: 12 }}
                            onClick={() => startPermEdit(u)}
                          >
                            Изменить
                          </button>
                        </>
                      ) : null}
                    </span>
                  )}
                </td>
                <td>
                  {u.role !== 'DIRECTOR' ? (
                    <span>
                      {u.city ? branchLabel(u.city) : '—'}
                    </span>
                  ) : branchEditId === u.id ? (
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      {cities.map((c) => (
                        <label
                          key={c.id}
                          style={{
                            display: 'flex',
                            gap: 4,
                            alignItems: 'center',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={branchSel.includes(c.id)}
                            onChange={() =>
                              setBranchSel(toggle(branchSel, c.id))
                            }
                          />
                          {branchLabel(c)}
                        </label>
                      ))}
                      <button
                        type="button"
                        className="btn"
                        onClick={() => saveBranches(u.id)}
                      >
                        Сохранить
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => {
                          setBranchEditId(null);
                          setBranchSel([]);
                        }}
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <span
                      style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                    >
                      {(u.managedCityIds ?? []).length
                        ? (u.managedCityIds ?? []).map(cityLabel).join(', ')
                        : '—'}
                      {isOwner ? (
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => {
                            setBranchEditId(u.id);
                            setBranchSel(u.managedCityIds ?? []);
                          }}
                        >
                          ✎
                        </button>
                      ) : null}
                    </span>
                  )}
                </td>
                <td>{u.phone ?? '—'}</td>
                <td>{USER_STATUS_LABELS[u.status] ?? u.status}</td>
                <td>
                  {admin && u.status === 'ACTIVE' ? (
                    fireId === u.id ? (
                      <div
                        style={{
                          display: 'flex',
                          gap: 4,
                          flexWrap: 'wrap',
                          alignItems: 'center',
                        }}
                      >
                        <input
                          placeholder="Причина увольнения"
                          value={fireForm.reason}
                          onChange={(e) =>
                            setFireForm({ ...fireForm, reason: e.target.value })
                          }
                        />
                        <label
                          style={{
                            display: 'flex',
                            gap: 4,
                            alignItems: 'center',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={fireForm.recommendedHire}
                            onChange={(e) =>
                              setFireForm({
                                ...fireForm,
                                recommendedHire: e.target.checked,
                              })
                            }
                          />
                          Рекомендовать
                        </label>
                        <button
                          type="button"
                          className="btn danger"
                          onClick={() => fireUser(u.id)}
                        >
                          Уволить
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => {
                            setFireId(null);
                            setFireForm({ reason: '', recommendedHire: true });
                          }}
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => setFireId(u.id)}
                      >
                        Уволить
                      </button>
                    )
                  ) : admin && u.status === 'FIRED' ? (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => restoreUser(u.id)}
                    >
                      Восстановить
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
