'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { BranchSelect } from '@/components/BranchSelect';
import {
  api,
  fetchAuthorizedBlob,
  getStoredUser,
  uploadFiles,
} from '@/lib/api';
import {
  DOC_KIND_LABELS,
  ORDER_UPLOAD_DOC_KINDS,
  SD_UPLOAD_DOC_KIND,
  STATUS_LABELS,
  TYPE_LABELS,
  isAdminRole,
  requiredOrderDocKinds,
} from '@/lib/labels';
import { formatRuPhoneDisplay } from '@/lib/phone';
import { downloadFilesAsZipOrSingle } from '@/lib/zip-store';

type Master = { id: string; user: { fullName: string } };
type City = { id: string; name: string };

type OrderDocument = {
  id: string;
  kind: string;
  forStatus?: string | null;
  fileName: string;
  filePath: string;
  mimeType?: string | null;
  createdAt: string;
};

type DocGroup = {
  kind: string;
  docs: OrderDocument[];
  latestAt: string;
};

type DocPreview = {
  kind: string;
  docs: OrderDocument[];
  index: number;
  id: string;
  fileName: string;
  mimeType: string;
  url: string;
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
  createdBy?: { id: string; fullName: string; role: string } | null;
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

function guessMimeFromName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.heic')) return 'image/heic';
  return 'application/octet-stream';
}

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
  const [typeTech, setTypeTech] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [paid, setPaid] = useState('0');
  const [partsCost, setPartsCost] = useState('0');
  const [cancelFault, setCancelFault] = useState<'master' | 'admin' | ''>('');
  const [isProfile, setIsProfile] = useState(true);

  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimForm, setClaimForm] = useState({
    type: 'PRICE_DISSATISFIED',
    refundSum: '0',
    cityId: '',
  });

  const [docKind, setDocKind] = useState<string>(ORDER_UPLOAD_DOC_KINDS[0]);
  const [docFiles, setDocFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<DocPreview | null>(null);
  const [previewLoadingKind, setPreviewLoadingKind] = useState<string | null>(
    null,
  );
  const [downloadLoadingKind, setDownloadLoadingKind] = useState<string | null>(
    null,
  );

  async function load() {
    const data = await api<Order>(`/orders/${id}`);
    setOrder(data);
    setStatus(data.status);
    setMasterId(data.masterId ?? '');
    setAddress(data.address ?? '');
    setTypeTech(data.typeTech ?? '');
    setScheduledAt(toLocalInput(data.scheduledAt));
    setPaid(String(data.payment?.paid ?? 0));
    setPartsCost(String(data.payment?.partsCost ?? 0));
    setCancelFault(
      data.cancelFault === 'master' || data.cancelFault === 'admin'
        ? data.cancelFault
        : '',
    );
    setIsProfile(Boolean(data.isProfile));
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
  const partsCostNum = Number(partsCost);
  const needsDocs = paidNum > 500;
  const presentKinds = useMemo(
    () => new Set((order?.documents ?? []).map((d) => d.kind)),
    [order?.documents],
  );
  const requiredKinds = useMemo(
    () => requiredOrderDocKinds(partsCostNum),
    [partsCostNum],
  );
  const checklistKinds = useMemo(() => {
    if (status === 'IN_PROGRESS_SD') {
      return [...ORDER_UPLOAD_DOC_KINDS, SD_UPLOAD_DOC_KIND];
    }
    return [...ORDER_UPLOAD_DOC_KINDS];
  }, [status]);
  const uploadKinds = checklistKinds;
  const missingKinds = requiredKinds.filter((k) => !presentKinds.has(k));
  const sdMissing =
    status === 'IN_PROGRESS_SD' && !presentKinds.has(SD_UPLOAD_DOC_KIND);
  const hasAllDocs = missingKinds.length === 0;
  const doneBlocked = status === 'DONE' && needsDocs && !hasAllDocs;
  const sdBlocked = sdMissing;

  useEffect(() => {
    if (
      docKind === SD_UPLOAD_DOC_KIND &&
      status !== 'IN_PROGRESS_SD'
    ) {
      setDocKind(ORDER_UPLOAD_DOC_KINDS[0]);
    }
  }, [status, docKind]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (status === 'DONE' && !masterId) {
      setError('Для статуса «Готов» назначьте мастера');
      return;
    }
    if (doneBlocked) {
      setError(
        `Для статуса «Готов» при сумме > 500 ₽ нужны все документы: ${missingKinds
          .map((k) => DOC_KIND_LABELS[k])
          .join(', ')}.`,
      );
      return;
    }
    if (sdBlocked) {
      setError('Для статуса «В работе СД» загрузите сохранную расписку.');
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
        body.typeTech = typeTech || null;
        body.scheduledAt = scheduledAt
          ? new Date(scheduledAt).toISOString()
          : null;
        body.paid = Number(paid);
        body.partsCost = Number(partsCost);
        body.isProfile = isProfile;
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
      const qs = new URLSearchParams({ kind: docKind });
      if (docKind === SD_UPLOAD_DOC_KIND) {
        qs.set('forStatus', 'IN_PROGRESS_SD');
      }
      const res = await uploadFiles<{
        created?: unknown[];
        skipped?: number;
      }>(`/orders/${id}/documents?${qs}`, fd);
      setDocFiles(null);
      (e.target as HTMLFormElement).reset();
      // Дубликаты по хешу пропускаются без уведомлений
      if ((res?.created?.length ?? 0) > 0) {
        setMsg('Документы загружены');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setUploading(false);
    }
  }

  const docGroups = useMemo((): DocGroup[] => {
    const docs = order?.documents ?? [];
    const byKind = new Map<string, OrderDocument[]>();
    for (const d of docs) {
      const list = byKind.get(d.kind) ?? [];
      list.push(d);
      byKind.set(d.kind, list);
    }
    const kindOrder = [
      ...ORDER_UPLOAD_DOC_KINDS,
      SD_UPLOAD_DOC_KIND,
      ...[...byKind.keys()].filter(
        (k) =>
          !(ORDER_UPLOAD_DOC_KINDS as readonly string[]).includes(k) &&
          k !== SD_UPLOAD_DOC_KIND,
      ),
    ];
    return kindOrder
      .filter((k) => byKind.has(k))
      .map((kind) => {
        const list = [...(byKind.get(kind) ?? [])].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        return {
          kind,
          docs: list,
          latestAt: list[list.length - 1]?.createdAt ?? '',
        };
      });
  }, [order?.documents]);

  async function downloadGroup(group: DocGroup) {
    setError('');
    setDownloadLoadingKind(group.kind);
    try {
      const files = await Promise.all(
        group.docs.map(async (d, i) => {
          const blob = await fetchAuthorizedBlob(
            `/orders/${id}/documents/${d.id}/download`,
          );
          const ext =
            d.fileName.includes('.')
              ? d.fileName.slice(d.fileName.lastIndexOf('.'))
              : '';
          return {
            name:
              group.docs.length === 1
                ? d.fileName
                : `${i + 1}${ext || ''}`,
            blob,
          };
        }),
      );
      const label = DOC_KIND_LABELS[group.kind] ?? group.kind;
      await downloadFilesAsZipOrSingle(
        files,
        `${order?.publicId ?? 'docs'}-${label}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка скачивания');
    } finally {
      setDownloadLoadingKind(null);
    }
  }

  function closePreview() {
    setPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  async function loadPreviewAt(
    kind: string,
    docs: OrderDocument[],
    index: number,
  ) {
    const doc = docs[index];
    if (!doc) return;
    setError('');
    setPreviewLoadingKind(kind);
    try {
      const blob = await fetchAuthorizedBlob(
        `/orders/${id}/documents/${doc.id}/download`,
      );
      const mime =
        doc.mimeType || blob.type || guessMimeFromName(doc.fileName);
      const url = URL.createObjectURL(
        blob.type ? blob : new Blob([blob], { type: mime }),
      );
      setPreview((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return {
          kind,
          docs,
          index,
          id: doc.id,
          fileName: doc.fileName,
          mimeType: mime,
          url,
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка предпросмотра');
    } finally {
      setPreviewLoadingKind(null);
    }
  }

  function openPreviewGroup(group: DocGroup) {
    void loadPreviewAt(group.kind, group.docs, 0);
  }

  function previewStep(delta: number) {
    if (!preview || preview.docs.length < 2) return;
    const next =
      (preview.index + delta + preview.docs.length) % preview.docs.length;
    void loadPreviewAt(preview.kind, preview.docs, next);
  }

  useEffect(() => {
    if (!preview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPreview((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return null;
        });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        previewStep(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        previewStep(1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

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

  const scheduledLabel = order.scheduledAt
    ? new Date(order.scheduledAt).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <div className="order-page">
      <div className="order-page-head">
        <h1 className="page-title order-page-title">
          Заявка <span className="order-page-id">{order.publicId}</span>
        </h1>
        <div className="order-page-badges">
          <span className="badge order-badge-status">
            {STATUS_LABELS[order.status]}
          </span>
          <span className={isProfile ? 'badge' : 'badge badge-warn'}>
            {isProfile ? 'Профильная' : 'Непрофильная'}
          </span>
          <span className="badge order-badge-type">
            {TYPE_LABELS[order.type] ?? order.type}
          </span>
          {order.isClaim ? (
            <span className="badge badge-warn">Претензия</span>
          ) : null}
        </div>
      </div>

      <div className="order-page-grid">
        <form className="panel order-card" onSubmit={save}>
          {order.docsViaAdmin ? (
            <div className="banner-warn">
              Мастер попросил загрузить документы через администратора и закрыть
              заявку.
            </div>
          ) : null}

          <div className="order-client">
            <div className="order-client-main">
              <div className="order-client-name">{order.client.name}</div>
              <a
                className="order-client-phone"
                href={`tel:+${order.client.phoneNormalized.replace(/\D/g, '')}`}
              >
                {formatRuPhoneDisplay(order.client.phoneNormalized)}
              </a>
            </div>
            <Link className="order-client-link" href={`/clients/${order.client.id}`}>
              Карточка клиента
            </Link>
          </div>

          {admin ? (
            <label className="order-profile-check">
              <input
                type="checkbox"
                checked={isProfile}
                onChange={(e) => setIsProfile(e.target.checked)}
              />
              Профильная заявка
            </label>
          ) : null}

          {admin ? (
            <div className="order-section">
              <div className="order-section-title">Детали</div>
              <div className="order-fields-grid">
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
                  <label>Диспетчер</label>
                  <input
                    readOnly
                    disabled
                    value={order.createdBy?.fullName ?? '—'}
                  />
                </div>
                <div className="field order-field-full">
                  <label>Комментарий диспетчера</label>
                  <textarea
                    readOnly
                    disabled
                    rows={2}
                    value={order.comment?.trim() ? order.comment : '—'}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="order-meta">
              <div className="order-meta-item">
                <span>Адрес</span>
                <strong>{order.address}</strong>
              </div>
              <div className="order-meta-item">
                <span>Техника</span>
                <strong>{order.typeTech?.trim() || '—'}</strong>
              </div>
              <div className="order-meta-item">
                <span>Время</span>
                <strong>{scheduledLabel}</strong>
              </div>
              <div className="order-meta-item">
                <span>Диспетчер</span>
                <strong>{order.createdBy?.fullName ?? '—'}</strong>
              </div>
              <div className="order-meta-item">
                <span>Мастер</span>
                <strong>{order.master?.user.fullName ?? 'не назначен'}</strong>
              </div>
              {order.comment?.trim() ? (
                <div className="order-meta-item order-meta-full">
                  <span>Комментарий</span>
                  <strong>{order.comment}</strong>
                </div>
              ) : null}
            </div>
          )}

          {admin ? (
            <div className="order-section">
              <div className="order-section-title">Исполнение</div>
              <div className="order-fields-grid">
                <div className="field">
                  <label>Статус</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
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
                          e.target.value === 'master' ||
                            e.target.value === 'admin'
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
                  <label>
                    Мастер
                    {status === 'DONE' ? ' *' : ''}
                  </label>
                  <select
                    value={masterId}
                    onChange={(e) => setMasterId(e.target.value)}
                    required={status === 'DONE'}
                  >
                    <option value="">Не назначен</option>
                    {masters.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.user.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Оплачено клиентом</label>
                  <input
                    value={paid}
                    onChange={(e) => setPaid(e.target.value)}
                  />
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
                <div className="order-pay-summary">
                  <div className="order-pay-item">
                    <span>Сумма работ</span>
                    <strong>{String(order.payment.workSum)} ₽</strong>
                  </div>
                  <div className="order-pay-item">
                    <span>% мастера</span>
                    <strong>
                      {(Number(order.payment.masterPct) * 100).toFixed(1)}%
                    </strong>
                  </div>
                  <div className="order-pay-item">
                    <span>ЗП мастера</span>
                    <strong>{String(order.payment.masterSalary)} ₽</strong>
                  </div>
                  <div className="order-pay-item accent">
                    <span>К сдаче</span>
                    <strong>{String(order.payment.toCompany)} ₽</strong>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="error">{error}</p> : null}
          {msg ? <p className="ok-msg">{msg}</p> : null}

          <div className="order-actions">
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
            <button
              className="btn secondary"
              type="button"
              onClick={makeRepeat}
            >
              На повтор
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={makeWarranty}
            >
              Гарантия
            </button>
          </div>
        </form>

        <div className="order-side">
          {showClaimForm && admin ? (
            <form className="panel" onSubmit={createClaim}>
              <h2 className="order-side-title">Новая претензия</h2>
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
                <BranchSelect
                  cities={cities}
                  value={claimForm.cityId}
                  onChange={(cityId) =>
                    setClaimForm({ ...claimForm, cityId })
                  }
                  allowEmpty
                />
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

          {admin ? (
          <div className="panel">
            <h2 className="order-side-title">Документы</h2>
            <ul className="docs-checklist">
              {checklistKinds.map((k) => {
                const ok = presentKinds.has(k);
                const required =
                  k === SD_UPLOAD_DOC_KIND
                    ? status === 'IN_PROGRESS_SD'
                    : requiredKinds.includes(k as (typeof ORDER_UPLOAD_DOC_KINDS)[number]);
                return (
                  <li
                    key={k}
                    className={ok ? 'ok' : required ? 'miss' : 'optional'}
                  >
                    <span>{ok ? '✓' : required ? '○' : '–'}</span>
                    <span>
                      {DOC_KIND_LABELS[k]}
                      {!required && k !== SD_UPLOAD_DOC_KIND
                        ? ' (опционально)'
                        : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
            <table className="table docs-table">
              <thead>
                <tr>
                  <th>Тип</th>
                  <th>Дата</th>
                  <th className="docs-col-actions">Действия</th>
                </tr>
              </thead>
              <tbody>
                {docGroups.map((g) => (
                  <tr key={g.kind}>
                    <td>
                      <span className="docs-kind">
                        {DOC_KIND_LABELS[g.kind] ?? g.kind}
                      </span>
                      {g.docs.length > 1 ? (
                        <span className="docs-count">{g.docs.length}</span>
                      ) : null}
                    </td>
                    <td className="muted">
                      {g.latestAt
                        ? new Date(g.latestAt).toLocaleDateString('ru-RU')
                        : '—'}
                    </td>
                    <td>
                      <div className="docs-actions">
                        <button
                          type="button"
                          className="btn-link"
                          disabled={previewLoadingKind === g.kind}
                          onClick={() => openPreviewGroup(g)}
                        >
                          {previewLoadingKind === g.kind
                            ? '…'
                            : 'Предпросмотр'}
                        </button>
                        <button
                          type="button"
                          className="btn-link"
                          disabled={downloadLoadingKind === g.kind}
                          onClick={() => void downloadGroup(g)}
                        >
                          {downloadLoadingKind === g.kind
                            ? '…'
                            : g.docs.length > 1
                              ? 'Скачать архив'
                              : 'Скачать'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {docGroups.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="muted">
                      Документов нет.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            {preview ? (
              <div
                className="doc-preview-overlay"
                role="dialog"
                aria-modal="true"
                aria-label={DOC_KIND_LABELS[preview.kind] ?? 'Документ'}
                onClick={closePreview}
              >
                <div
                  className="doc-preview-card"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="doc-preview-head">
                    <div>
                      <strong>
                        {DOC_KIND_LABELS[preview.kind] ?? 'Документ'}
                      </strong>
                      {preview.docs.length > 1 ? (
                        <div className="doc-preview-counter">
                          {preview.index + 1} / {preview.docs.length}
                        </div>
                      ) : null}
                    </div>
                    <div className="docs-actions">
                      {preview.docs.length > 1 ? (
                        <>
                          <button
                            type="button"
                            className="btn secondary"
                            disabled={previewLoadingKind === preview.kind}
                            onClick={() => previewStep(-1)}
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            className="btn secondary"
                            disabled={previewLoadingKind === preview.kind}
                            onClick={() => previewStep(1)}
                          >
                            →
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => {
                          const group = docGroups.find(
                            (x) => x.kind === preview.kind,
                          );
                          if (group) void downloadGroup(group);
                        }}
                      >
                        {preview.docs.length > 1 ? 'Скачать архив' : 'Скачать'}
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={closePreview}
                      >
                        Закрыть
                      </button>
                    </div>
                  </div>
                  <div className="doc-preview-body">
                    {previewLoadingKind === preview.kind ? (
                      <p className="muted">Загрузка…</p>
                    ) : preview.mimeType.startsWith('image/') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={preview.url}
                        alt={DOC_KIND_LABELS[preview.kind] ?? 'Документ'}
                        className="doc-preview-image"
                      />
                    ) : preview.mimeType === 'application/pdf' ||
                      preview.fileName.toLowerCase().endsWith('.pdf') ? (
                      <iframe
                        title={DOC_KIND_LABELS[preview.kind] ?? 'Документ'}
                        src={preview.url}
                        className="doc-preview-frame"
                      />
                    ) : (
                      <p className="muted" style={{ margin: '2rem 0' }}>
                        Предпросмотр этого типа файла недоступен. Скачайте файл.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <form onSubmit={uploadDoc} style={{ marginTop: 12 }}>
              <div className="grid-2">
                <div className="field">
                  <label>Тип документа</label>
                  <select value={docKind} onChange={(e) => setDocKind(e.target.value)}>
                    {uploadKinds.map((k) => (
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
          ) : null}

          <div className="panel">
            <h2 className="order-side-title">История клиента</h2>
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
