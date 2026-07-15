'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  api,
  appendFormFields,
  getStoredUser,
  uploadFiles,
} from '@/lib/api';
import { ROLE_LABELS, USER_STATUS_LABELS, isAdminRole } from '@/lib/labels';

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
  city?: { id: string; name: string } | null;
  managedCityIds?: string[];
};

type City = { id: string; name: string };

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

export default function UsersPage() {
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
  const role = getStoredUser()?.role ?? '';
  const admin = isAdminRole(role);
  const isOwner = role === 'OWNER';

  const cityName = (id: string) => cities.find((c) => c.id === id)?.name ?? id;

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
      });
      if (passportPhoto) fd.append('passportPhoto', passportPhoto);
      if (contractPhoto) fd.append('contractPhoto', contractPhoto);
      if (employeePhoto) fd.append('employeePhoto', employeePhoto);

      await uploadFiles('/users', fd);
      setForm(emptyForm);
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
      <h1 className="page-title">Сотрудники</h1>
      {admin ? (
        <form className="panel" onSubmit={onCreate} style={{ marginBottom: 16 }}>
          <div className="grid-2">
            <div className="field">
              <label>Логин</label>
              <input
                required
                value={form.login}
                onChange={(e) => setForm({ ...form, login: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Пароль</label>
              <input
                required
                type="password"
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
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
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
              <label>Город</label>
              <select
                value={form.cityId}
                onChange={(e) => setForm({ ...form, cityId: e.target.value })}
              >
                <option value="">—</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
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
            {form.role === 'DIRECTOR' ? (
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Филиалы под управлением директора</label>
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    flexWrap: 'wrap',
                    padding: '0.4rem 0',
                  }}
                >
                  {cities.map((c) => (
                    <label
                      key={c.id}
                      style={{ display: 'flex', gap: 4, alignItems: 'center' }}
                    >
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
                      {c.name}
                    </label>
                  ))}
                  {!cities.length ? (
                    <span className="muted">Сначала добавьте города</span>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="field">
              <label>Фото паспорта</label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) =>
                  setPassportPhoto(e.target.files?.[0] ?? null)
                }
              />
            </div>
            <div className="field">
              <label>Фото договора</label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) =>
                  setContractPhoto(e.target.files?.[0] ?? null)
                }
              />
            </div>
            <div className="field">
              <label>Фото сотрудника</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setEmployeePhoto(e.target.files?.[0] ?? null)
                }
              />
            </div>
          </div>
          <button className="btn" type="submit">
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
                  {u.role !== 'DIRECTOR' ? (
                    <span className="muted">—</span>
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
                          {c.name}
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
                        ? (u.managedCityIds ?? []).map(cityName).join(', ')
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
