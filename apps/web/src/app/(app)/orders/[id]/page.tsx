'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, downloadFile, getStoredUser, uploadFiles } from '@/lib/api';
import {
  DOC_KIND_LABELS,
  ORDER_UPLOAD_DOC_KINDS,
  STATUS_LABELS,
  TYPE_LABELS,
  isAdminRole,
} from '@/lib/labels';

type Master = { id: string; user: { fullName: string } };
type City = { id: string; name: string };

type OrderDocument = {
  id: string;
  kind: string;
  fileName: string;
  filePath: string;
  createdAt: string;
};

type Order = {
  id: string;
  publicId: string;
  status: string;
  type: string;
  address: string;
  comment?: string | null;
  typeTech?: string | null;
  isClaim: boolean;
  isWarranty: boolean;
  isProfile: boolean;
  scheduledAt?: string | null;
  masterId?: string | null;
  cityId?: string | null;
  docsViaAdmin?: boolean;
  cancelFault?: 'master' | 'admin' | null;
  client: {
    id: string;
    name: string;
    phoneNormalized: string;
    branchComment?: string | null;
    orders: Array<{
      id: string;
      publicId: string;
      status: string;
      type: string;
      createdAt: string;
      address: string;
      isClaim: boolean;
    }>;
  };
  payment?: {
    paid: string | number;
    partsCost: string | number;
    partsYesNo: boolean;
    workSum: string | number;
    masterPct: string | number;
    masterSalary: string | number;
    toCompany: string | number;
  } | null;
  documents?: OrderDocument[];
  master?: Master | null;
};

const STATUSES = Object.keys(STATUS_LABELS);

const CLAIM_TYPES: Record<string, string> = {
  POLICE: 'Полиция',
  MASTER_BROKE: 'Мастер сломал технику',
  PRICE_DISSATISFIED: 'Недоволен ценой',
};

function toLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fileNamesLabel(files: FileList | null) {
  if (!files?.length) return null;
  if (files.length === 1) return files[0].name;
  return `Выбрано: ${files.length}`;
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [masters, setMasters] = useState<Master[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const user = useMemo(() => getStoredUser(), []);
  const admin = user ? isAdminRole(user.role) : false;

  const [status, setStatus] = useState('');
  const [masterId, setMasterId] = useState('');
  const [address, setAddress] = useState('');
  const [comment, setComment] = useState('');
  const [typeTech, setTypeTech] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [paid, setPaid] = useState('0');
  const [partsCost, setPartsCost] = useState('0');
  const [cancelFault, setCancelFault] = useState<'master' | 'admin' | ''>('');

  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimForm, setClaimForm] = useState({
    type: 'PRICE_DISSATISFIED',
    refundSum: '0',
    cityId: '',
  });

  const [docKind, setDocKind] = useState<string>(ORDER_UPLOAD_DOC_KINDS[0]);
  const [docFiles, setDocFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);

  async function load() {
    const data = await api<Order>(`/orders/${id}`);
    setOrder(data);
    setStatus(data.status);
    setMasterId(data.masterId ?? '');
    setAddress(data.address ?? '');
    setComment(data.comment ?? '');
    setTypeTech(data.typeTech ?? '');
    setScheduledAt(toLocalInput(data.scheduledAt));
    setPaid(String(data.payment?.paid ?? 0));
    setPartsCost(String(data.payment?.partsCost ?? 0));
    setCancelFault(
      data.cancelFault === 'master' || data.cancelFault === 'admin'
        ? data.cancelFault
        : '',
    );
    setClaimForm((f) => ({
      ...f,
      cityId: f.cityId || data.cityId || '',
    }));
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
    api<Master[]>('/masters')
      .then(setMasters)
      .catch(() => undefined);
    api<City[]>('/cities')
      .then((list) => {
        setCities(list);
        if (list[0]) {
          setClaimForm((f) => ({ ...f, cityId: f.cityId || list[0].id }));
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const paidNum = Number(paid);
  const needsDocs = paidNum > 500;
  const presentKinds = useMemo(
    () => new Set((order?.documents ?? []).map((d) => d.kind)),
    [order?.documents],
  );
  const missingKinds = ORDER_UPLOAD_DOC_KINDS.filter((k) => !presentKinds.has(k));
  const hasAllDocs = missingKinds.length === 0;
  const doneBlocked = status === 'DONE' && needsDocs && !hasAllDocs;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (doneBlocked) {
      setError(
        `Для статуса «Готов» при сумме > 500 ₽ нужны все документы: ${missingKinds
          .map((k) => DOC_KIND_LABELS[k])
          .join(', ')}.`,
      );
      return;
    }
    setError('');
    setMsg('');
    try {
      const body: Record<string, unknown> = {};
      if (admin) {
        body.status = status;
        body.masterId = masterId || null;
        body.address = address;
        body.comment = comment || null;
        body.typeTech = typeTech || null;
        body.scheduledAt = scheduledAt
          ? new Date(scheduledAt).toISOString()
          : null;
        body.paid = Number(paid);
        body.partsCost = Number(partsCost);
        if (status === 'CANCELLED_CC' || status === 'REFUSAL') {
          body.cancelFault = cancelFault || null;
        }
      }
      await api(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setMsg('Сохранено');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    }
  }

  async function createClaim(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      await api('/claims', {
        method: 'POST',
        body: JSON.stringify({
          orderId: id,
          type: claimForm.type,
          refundSum: Number(claimForm.refundSum),
          cityId: claimForm.cityId || undefined,
        }),
      });
      setShowClaimForm(false);
      setMsg('Претензия создана');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка создания претензии');
    }
  }

  async function uploadDoc(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    if (!docFiles || docFiles.length === 0) {
      setError('Выберите файл(ы) для загрузки');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(docFiles).forEach((f) => fd.append('files', f));
      await uploadFiles(`/orders/${id}/documents?kind=${docKind}`, fd);
      setDocFiles(null);
      (e.target as HTMLFormElement).reset();
      setMsg('Документы загружены');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setUploading(false);
    }
  }

  async function download(docId: string, fileName: string) {
    try {
      await downloadFile(`/orders/${id}/documents/${docId}/download`, fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка скачивания');
    }
  }

  async function makeRepeat() {
    setError('');
    try {
      const created = await api<{ id: string }>(`/orders/${id}/repeat`, {
        method: 'POST',
      });
      router.push(`/orders/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function makeWarranty() {
    setError('');
    try {
      await api(`/orders/${id}/warranty`, { method: 'POST' });
      setMsg('Отмечено как гарантия');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  function goOrder(orderId: string) {
    router.push(`/orders/${orderId}`);
  }

  if (!order) {
    return (
      <div className="panel">
        {error ? <p className="error">{error}</p> : <p className="muted">Загрузка…</p>}
      </div>
    );
  }

  const selectedLabel = fileNamesLabel(docFiles);

  return (
    <div>
      <h1 className="page-title">
        Заявка {order.publicId}{' '}
        <span className="badge">{STATUS_LABELS[order.status]}</span>
      </h1>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <form className="panel" onSubmit={save}>
          {order.docsViaAdmin ? (
            <div className="banner-warn">
              Мастер попросил загрузить документы через администратора и закрыть
              заявку.
            </div>
          ) : null}

          <p>
            <strong>{order.client.name}</strong> · {order.client.phoneNormalized}
            <br />
            <Link href={`/clients/${order.client.id}`}>Карточка клиента →</Link>
          </p>
          <p className="muted">{TYPE_LABELS[order.type]}</p>

          {admin ? (
            <div className="grid-2" style={{ marginBottom: 12 }}>
              <div className="field">
                <label>Адрес</label>
                <input
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Тип техники</label>
                <input
                  value={typeTech}
                  onChange={(e) => setTypeTech(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Дата/время выполнения</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Комментарий</label>
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <>
              <p className="muted">
                {order.address}
                {order.typeTech ? ` · ${order.typeTech}` : ''}
                {order.scheduledAt
                  ? ` · ${new Date(order.scheduledAt).toLocaleString('ru-RU')}`
                  : ''}
              </p>
              {order.comment ? <p>{order.comment}</p> : null}
            </>
          )}

          {order.isClaim ? (
            <p className="muted" style={{ marginBottom: 12 }}>
              По заявке есть претензия
            </p>
          ) : null}

          {admin ? (
            <>
              <div className="field">
                <label>Статус</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              {status === 'CANCELLED_CC' || status === 'REFUSAL' ? (
                <div className="field">
                  <label>Виновник отмены</label>
                  <select
                    value={cancelFault}
                    onChange={(e) =>
                      setCancelFault(
                        e.target.value === 'master' || e.target.value === 'admin'
                          ? e.target.value
                          : '',
                      )
                    }
                  >
                    <option value="">—</option>
                    <option value="master">Мастер</option>
                    <option value="admin">Администратор</option>
                  </select>
                </div>
              ) : null}
              <div className="field">
                <label>Мастер</label>
                <select value={masterId} onChange={(e) => setMasterId(e.target.value)}>
                  <option value="">Не назначен</option>
                  {masters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.user.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>Оплачено клиентом</label>
                  <input value={paid} onChange={(e) => setPaid(e.target.value)} />
                </div>
                <div className="field">
                  <label>Комплектующие, ₽</label>
                  <input
                    value={partsCost}
                    onChange={(e) => setPartsCost(e.target.value)}
                  />
                </div>
              </div>

              {order.payment ? (
                <div
                  className="panel"
                  style={{ marginBottom: 12, background: '#f9fafb', padding: '0.75rem 1rem' }}
                >
                  <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>Расчёт выплат</p>
                  <div className="grid-2">
                    <p className="muted" style={{ margin: 0 }}>
                      Сумма работ: <strong>{String(order.payment.workSum)}</strong> ₽
                    </p>
                    <p className="muted" style={{ margin: 0 }}>
                      % мастера:{' '}
                      <strong>{(Number(order.payment.masterPct) * 100).toFixed(1)}</strong>%
                    </p>
                    <p className="muted" style={{ margin: 0 }}>
                      ЗП мастера:{' '}
                      <strong>{String(order.payment.masterSalary)}</strong> ₽
                    </p>
                    <p className="muted" style={{ margin: 0 }}>
                      Сумма к сдаче:{' '}
                      <strong>{String(order.payment.toCompany)}</strong> ₽
                    </p>
                  </div>
                </div>
              ) : null}

              {needsDocs ? (
                <p className="error" style={{ fontSize: '0.9rem' }}>
                  Сумма &gt; 500 ₽ — для статуса «Готов» обязательны все типы документов.
                  {hasAllDocs
                    ? ' Все документы загружены.'
                    : ` Не хватает: ${missingKinds.map((k) => DOC_KIND_LABELS[k]).join(', ')}.`}
                </p>
              ) : null}
            </>
          ) : (
            <p className="muted">
              Мастер: {order.master?.user.fullName ?? 'не назначен'}. Смена статусов
              исполнения — у администратора.
            </p>
          )}

          {error ? <p className="error">{error}</p> : null}
          {msg ? <p style={{ color: '#0f766e' }}>{msg}</p> : null}

          <div className="actions-row">
            <button className="btn" type="submit" disabled={doneBlocked}>
              Сохранить
            </button>
            {admin ? (
              <button
                className="btn secondary"
                type="button"
                onClick={() => setShowClaimForm((v) => !v)}
              >
                Создать претензию
              </button>
            ) : null}
            <button className="btn secondary" type="button" onClick={makeRepeat}>
              На повтор
            </button>
            <button className="btn secondary" type="button" onClick={makeWarranty}>
              Гарантия
            </button>
          </div>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {showClaimForm && admin ? (
            <form className="panel" onSubmit={createClaim}>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Новая претензия</h2>
              <div className="grid-2">
                <div className="field">
                  <label>Тип</label>
                  <select
                    value={claimForm.type}
                    onChange={(e) =>
                      setClaimForm({ ...claimForm, type: e.target.value })
                    }
                  >
                    {Object.entries(CLAIM_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Филиал</label>
                  <select
                    value={claimForm.cityId}
                    onChange={(e) =>
                      setClaimForm({ ...claimForm, cityId: e.target.value })
                    }
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
                  <label>Сумма возврата</label>
                  <input
                    value={claimForm.refundSum}
                    onChange={(e) =>
                      setClaimForm({ ...claimForm, refundSum: e.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label>Сумма заявки</label>
                  <input
                    readOnly
                    disabled
                    value={String(order.payment?.paid ?? 0)}
                    title="Подставляется из заявки"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" type="submit">
                  Создать
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => setShowClaimForm(false)}
                >
                  Отмена
                </button>
              </div>
            </form>
          ) : null}

          <div className="panel">
            <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Документы</h2>
            <ul className="docs-checklist">
              {ORDER_UPLOAD_DOC_KINDS.map((k) => {
                const ok = presentKinds.has(k);
                return (
                  <li key={k} className={ok ? 'ok' : 'miss'}>
                    <span>{ok ? '✓' : '○'}</span>
                    <span>{DOC_KIND_LABELS[k]}</span>
                  </li>
                );
              })}
            </ul>
            <table className="table">
              <thead>
                <tr>
                  <th>Тип</th>
                  <th>Файл</th>
                  <th>Дата</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(order.documents ?? []).map((d) => (
                  <tr key={d.id}>
                    <td>{DOC_KIND_LABELS[d.kind] ?? d.kind}</td>
                    <td>{d.fileName}</td>
                    <td>{new Date(d.createdAt).toLocaleDateString('ru-RU')}</td>
                    <td>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => download(d.id, d.fileName)}
                      >
                        Скачать
                      </button>
                    </td>
                  </tr>
                ))}
                {(order.documents ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      Документов нет.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            <form onSubmit={uploadDoc} style={{ marginTop: 12 }}>
              <div className="grid-2">
                <div className="field">
                  <label>Тип документа</label>
                  <select value={docKind} onChange={(e) => setDocKind(e.target.value)}>
                    {ORDER_UPLOAD_DOC_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {DOC_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Файлы</label>
                  <label className="file-picker">
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf,application/pdf"
                      onChange={(e) => setDocFiles(e.target.files)}
                    />
                    <span className="file-picker-title">
                      {selectedLabel ?? 'Выбрать файлы'}
                    </span>
                    <span className="file-picker-hint">фото или PDF</span>
                  </label>
                </div>
              </div>
              <button type="submit" className="btn secondary" disabled={uploading}>
                {uploading ? 'Загрузка…' : 'Загрузить файлы'}
              </button>
            </form>
          </div>

          <div className="panel">
            <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>История клиента</h2>
            {order.client.branchComment ? (
              <p className="muted">Комментарий филиала: {order.client.branchComment}</p>
            ) : null}
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Тип</th>
                  <th>Статус</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {order.client.orders.map((o) => (
                  <tr
                    key={o.id}
                    className="row-link"
                    role="link"
                    tabIndex={0}
                    onClick={() => goOrder(o.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        goOrder(o.id);
                      }
                    }}
                  >
                    <td>
                      <strong>{o.publicId}</strong>
                      {o.isClaim ? ' ⚠' : ''}
                    </td>
                    <td>{TYPE_LABELS[o.type]}</td>
                    <td>{STATUS_LABELS[o.status]}</td>
                    <td>{new Date(o.createdAt).toLocaleDateString('ru-RU')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
