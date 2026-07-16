'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AutoTextarea } from '@/components/AutoTextarea';
import { BranchSelect } from '@/components/BranchSelect';
import { DateTimeField } from '@/components/DateTimeField';
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
  pendingReview?: boolean;
  fileName: string;
  filePath: string;
  mimeType?: string | null;
  createdAt: string;
};

const CLASSIFY_DOC_KINDS = [
  'RECEIPT_SERVICE',
  'CONTRACT',
  'RECEIPT_PARTS',
  'PARTS_PHOTO',
  'RECEIPT_SD',
  'OTHER',
] as const;

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
  adminComment?: string | null;
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

function shortFileName(name: string, max = 28): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const base = name.slice(0, Math.max(8, max - ext.length - 1));
  return `${base}…${ext}`;
}

function fileNamesLabel(files: FileList | null) {
  if (!files?.length) return null;
  if (files.length === 1) return shortFileName(files[0].name);
  return `Выбрано: ${files.length}`;
}

/** Следующий обязательный тип документа по чеклисту. */
function pickNextRequiredDocKind(
  checklist: string[],
  present: Set<string>,
  required: readonly string[],
  status: string,
  afterKind?: string,
): string {
  const isRequired = (k: string) => {
    if (k === SD_UPLOAD_DOC_KIND) return status === 'IN_PROGRESS_SD';
    return (required as readonly string[]).includes(k);
  };

  const start = afterKind ? checklist.indexOf(afterKind) + 1 : 0;
  const from = Math.max(0, start);
  const sequence = [...checklist.slice(from), ...checklist.slice(0, from)];

  for (const k of sequence) {
    if (isRequired(k) && !present.has(k)) return k;
  }
  if (afterKind && checklist.includes(afterKind)) return afterKind;
  return checklist[0] ?? ORDER_UPLOAD_DOC_KINDS[0];
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [masters, setMasters] = useState<Master[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [error, setError] = useState('');
  const user = useMemo(() => getStoredUser(), []);
  const admin = user ? isAdminRole(user.role) : false;

  const [status, setStatus] = useState('');
  const [masterId, setMasterId] = useState('');
  const [address, setAddress] = useState('');
  const [typeTech, setTypeTech] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [paid, setPaid] = useState('0');
  const [partsCost, setPartsCost] = useState('');
  const [cancelFault, setCancelFault] = useState<'master' | 'admin' | ''>('');
  const [isProfile, setIsProfile] = useState(true);
  const [adminComment, setAdminComment] = useState('');

  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimForm, setClaimForm] = useState({
    type: 'PRICE_DISSATISFIED',
    refundSum: '',
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
  const [pendingThumbs, setPendingThumbs] = useState<Record<string, string>>(
    {},
  );
  const pendingThumbsRef = useRef<Record<string, string>>({});

  async function load(opts?: { preserveMoney?: boolean }) {
    const keepPaid = opts?.preserveMoney ? paid : null;
    const keepParts = opts?.preserveMoney ? partsCost : null;
    const data = await api<Order>(`/orders/${id}`);
    setOrder(data);
    setStatus(data.status);
    setMasterId(data.masterId ?? '');
    setAddress(data.address ?? '');
    setTypeTech(data.typeTech ?? '');
    setScheduledAt(toLocalInput(data.scheduledAt));
    if (keepPaid != null) {
      setPaid(keepPaid);
    } else {
      setPaid(String(data.payment?.paid ?? 0));
    }
    if (keepParts != null) {
      setPartsCost(keepParts);
    } else {
      const parts = Number(data.payment?.partsCost ?? 0);
      setPartsCost(parts > 0 ? String(parts) : '');
    }
    setCancelFault(
      data.cancelFault === 'master' || data.cancelFault === 'admin'
        ? data.cancelFault
        : '',
    );
    setIsProfile(Boolean(data.isProfile));
    setAdminComment(data.adminComment ?? '');
    setClaimForm((f) => ({
      ...f,
      cityId: f.cityId || data.cityId || '',
    }));
  }

  /** Сохраняет только суммы — чтобы не слетали при загрузке документов. */
  async function saveMoneyDraft(): Promise<boolean> {
    if (!admin) return true;
    try {
      await api(`/orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          paid: Number(paid) || 0,
          partsCost: Number(partsCost) || 0,
        }),
      });
      // Обновить блок «К сдаче» / ЗП, не трогая поля ввода
      const data = await api<Order>(`/orders/${id}`);
      setOrder(data);
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Не удалось сохранить сумму',
      );
      return false;
    }
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
    () =>
      new Set(
        (order?.documents ?? [])
          .filter((d) => !d.pendingReview)
          .map((d) => d.kind),
      ),
    [order?.documents],
  );
  const pendingDocs = useMemo(
    () => (order?.documents ?? []).filter((d) => d.pendingReview),
    [order?.documents],
  );

  useEffect(() => {
    let cancelled = false;
    const ids = new Set(pendingDocs.map((d) => d.id));

    for (const [docId, url] of Object.entries(pendingThumbsRef.current)) {
      if (!ids.has(docId)) {
        URL.revokeObjectURL(url);
        delete pendingThumbsRef.current[docId];
      }
    }

    async function loadThumbs() {
      const next: Record<string, string> = { ...pendingThumbsRef.current };
      await Promise.all(
        pendingDocs.map(async (d) => {
          if (next[d.id]) return;
          const imageLike =
            (d.mimeType?.startsWith('image/') ?? false) ||
            /\.(jpe?g|png|webp|gif)$/i.test(d.fileName);
          if (!imageLike) return;
          try {
            const blob = await fetchAuthorizedBlob(
              `/orders/${id}/documents/${d.id}/download`,
            );
            if (cancelled) return;
            const mime =
              d.mimeType || blob.type || guessMimeFromName(d.fileName);
            next[d.id] = URL.createObjectURL(
              blob.type ? blob : new Blob([blob], { type: mime }),
            );
          } catch {
            /* превью не критично */
          }
        }),
      );
      if (cancelled) return;
      pendingThumbsRef.current = next;
      setPendingThumbs({ ...next });
    }

    void loadThumbs();
    return () => {
      cancelled = true;
    };
  }, [pendingDocs, id]);

  useEffect(() => {
    return () => {
      for (const url of Object.values(pendingThumbsRef.current)) {
        URL.revokeObjectURL(url);
      }
      pendingThumbsRef.current = {};
    };
  }, []);
  const requiredKinds = useMemo(
    () => requiredOrderDocKinds(partsCostNum),
    [partsCostNum],
  );
  const checklistKinds = useMemo((): string[] => {
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

  // Если текущий тип уже есть / недоступен — переключить на следующий обязательный.
  useEffect(() => {
    if (!order) return;
    setDocKind((current) => {
      const inList = checklistKinds.includes(current);
      if (inList && !presentKinds.has(current)) return current;
      return pickNextRequiredDocKind(
        checklistKinds,
        presentKinds,
        requiredKinds,
        status,
      );
    });
  }, [order?.documents, requiredKinds, status, checklistKinds, presentKinds, order]);

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
        body.adminComment = adminComment.trim() || null;
        if (status === 'CANCELLED_CC' || status === 'REFUSAL') {
          body.cancelFault = cancelFault || null;
        }
      }
      await api(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    }
  }

  async function createClaim(e: FormEvent) {
    e.preventDefault();
    setError('');
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка создания претензии');
    }
  }

  async function uploadDoc(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!docFiles || docFiles.length === 0) {
      setError('Выберите файл(ы) для загрузки');
      return;
    }
    setUploading(true);
    try {
      // Сначала сохраняем суммы — иначе load() после загрузки их затрёт.
      const moneyOk = await saveMoneyDraft();
      if (!moneyOk) return;

      const fd = new FormData();
      Array.from(docFiles).forEach((f) => fd.append('files', f));
      const qs = new URLSearchParams({ kind: docKind });
      if (docKind === SD_UPLOAD_DOC_KIND) {
        qs.set('forStatus', 'IN_PROGRESS_SD');
      }
      const uploadedKind = docKind;
      await uploadFiles<{
        created?: unknown[];
        skipped?: number;
      }>(`/orders/${id}/documents?${qs}`, fd);
      setDocFiles(null);
      (e.target as HTMLFormElement).reset();
      const nextPresent = new Set(presentKinds);
      nextPresent.add(uploadedKind);
      setDocKind(
        pickNextRequiredDocKind(
          checklistKinds,
          nextPresent,
          requiredKinds,
          status,
          uploadedKind,
        ),
      );
      await load({ preserveMoney: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setUploading(false);
    }
  }

  async function classifyPendingDoc(docId: string, kind: string) {
    setError('');
    try {
      await api(`/orders/${id}/documents/${docId}`, {
        method: 'PATCH',
        body: JSON.stringify({ kind }),
      });
      await load({ preserveMoney: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Не удалось назначить тип',
      );
    }
  }

  async function removePendingDoc(docId: string) {
    setError('');
    try {
      await api(`/orders/${id}/documents/${docId}`, { method: 'DELETE' });
      await load({ preserveMoney: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить файл');
    }
  }

  const docGroups = useMemo((): DocGroup[] => {
    const docs = (order?.documents ?? []).filter((d) => !d.pendingReview);
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
      <div className="order-page-grid">
        <form className="panel order-card" onSubmit={save}>
          {order.docsViaAdmin ? (
            <div className="banner-warn">
              Мастер попросил закрыть заявку через администратора.
              {pendingDocs.length
                ? ` Во «Входящих» ${pendingDocs.length} файл(ов) — назначьте типы.`
                : ' Мастер может прислать фото в бот — они появятся во «Входящих» ниже.'}
            </div>
          ) : null}

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

          <div className="order-client-row">
            <Link
              className="order-client"
              href={`/clients/${order.client.id}`}
              title="Открыть карточку клиента"
            >
              <div className="order-client-main">
                <span className="order-client-name">{order.client.name}</span>
                <span className="order-client-phone">
                  {formatRuPhoneDisplay(order.client.phoneNormalized)}
                </span>
              </div>
            </Link>
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
          </div>

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
                  <DateTimeField
                    value={scheduledAt}
                    onChange={setScheduledAt}
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
                  <AutoTextarea
                    readOnly
                    disabled
                    value={order.comment?.trim() ? order.comment : '—'}
                  />
                </div>
                <div className="field order-field-full">
                  <label>Комментарий администратора</label>
                  <AutoTextarea
                    value={adminComment}
                    onChange={(e) => setAdminComment(e.target.value)}
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
                  <span>Комментарий диспетчера</span>
                  <strong>{order.comment}</strong>
                </div>
              ) : null}
              {order.adminComment?.trim() ? (
                <div className="order-meta-item order-meta-full">
                  <span>Комментарий администратора</span>
                  <strong>{order.adminComment}</strong>
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
                    inputMode="decimal"
                    onChange={(e) => setPaid(e.target.value)}
                    onBlur={() => {
                      void saveMoneyDraft();
                    }}
                  />
                </div>
                <div className="field">
                  <label>Комплектующие, ₽</label>
                  <input
                    value={partsCost}
                    inputMode="decimal"
                    onChange={(e) => setPartsCost(e.target.value)}
                    onBlur={() => {
                      void saveMoneyDraft();
                    }}
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
          <div className="panel order-docs-panel">
            <h2 className="order-side-title">Документы</h2>
            {pendingDocs.length || order.docsViaAdmin ? (
              <div className="docs-inbox">
                <h3 className="docs-inbox-title">Входящие от мастера</h3>
                {!pendingDocs.length ? (
                  <p className="muted docs-inbox-empty">
                    Пока пусто. Файлы из бота появятся здесь.
                  </p>
                ) : (
                  <ul className="docs-inbox-list">
                    {pendingDocs.map((d) => {
                      const thumb = pendingThumbs[d.id];
                      const openFull = () =>
                        openPreviewGroup({
                          kind: d.kind,
                          docs: [d],
                          latestAt: d.createdAt,
                        });
                      return (
                        <li key={d.id} className="docs-inbox-item">
                          <button
                            type="button"
                            className="docs-inbox-thumb"
                            onClick={openFull}
                            title="Открыть крупно"
                          >
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={thumb} alt={d.fileName} />
                            ) : (
                              <span className="docs-inbox-thumb-fallback">
                                {d.fileName.toLowerCase().endsWith('.pdf')
                                  ? 'PDF'
                                  : '…'}
                              </span>
                            )}
                          </button>
                          <div className="docs-inbox-body">
                            <div className="docs-inbox-meta">
                              <span
                                className="docs-inbox-name"
                                title={d.fileName}
                              >
                                {d.fileName}
                              </span>
                              <span className="muted">
                                {new Date(d.createdAt).toLocaleString('ru-RU', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <div className="docs-inbox-actions">
                              <select
                                className="docs-inbox-select"
                                defaultValue=""
                                onChange={(e) => {
                                  const kind = e.target.value;
                                  if (!kind) return;
                                  void classifyPendingDoc(d.id, kind);
                                }}
                              >
                                <option value="" disabled>
                                  Назначить тип…
                                </option>
                                {CLASSIFY_DOC_KINDS.map((k) => (
                                  <option key={k} value={k}>
                                    {DOC_KIND_LABELS[k] ?? k}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="btn-link docs-inbox-remove"
                                onClick={() => void removePendingDoc(d.id)}
                              >
                                Удалить
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
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
                    <span>{DOC_KIND_LABELS[k]}</span>
                  </li>
                );
              })}
            </ul>
            {docGroups.length === 0 ? (
              <p className="muted docs-empty">Документов нет.</p>
            ) : (
              <ul className="docs-list">
                {docGroups.map((g) => (
                  <li key={g.kind} className="docs-list-item">
                    <div className="docs-list-main">
                      <span className="docs-kind">
                        {DOC_KIND_LABELS[g.kind] ?? g.kind}
                      </span>
                      {g.docs.length > 1 ? (
                        <span className="docs-count">{g.docs.length}</span>
                      ) : null}
                      <span className="muted docs-list-date">
                        {g.latestAt
                          ? new Date(g.latestAt).toLocaleDateString('ru-RU')
                          : '—'}
                      </span>
                    </div>
                    <div className="docs-actions">
                      <button
                        type="button"
                        className="btn-link"
                        disabled={previewLoadingKind === g.kind}
                        onClick={() => openPreviewGroup(g)}
                      >
                        {previewLoadingKind === g.kind ? '…' : 'Просмотр'}
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
                            ? 'Архив'
                            : 'Скачать'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

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

            <form onSubmit={uploadDoc} className="docs-upload-form">
              <div className="docs-upload-row">
                <div className="field">
                  <label>Тип документа</label>
                  <select
                    value={docKind}
                    onChange={(e) => setDocKind(e.target.value)}
                  >
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
                    <span className="file-picker-title" title={selectedLabel ?? undefined}>
                      {selectedLabel ?? 'Выбрать файлы'}
                    </span>
                    <span className="file-picker-hint">фото или PDF</span>
                  </label>
                </div>
              </div>
              <button
                type="submit"
                className="btn secondary docs-upload-submit"
                disabled={uploading}
              >
                {uploading ? 'Загрузка…' : 'Загрузить файлы'}
              </button>
            </form>
          </div>
          ) : null}

          <div className="panel order-history-panel">
            <h2 className="order-side-title">История клиента</h2>
            {order.client.branchComment ? (
              <p className="muted order-history-note">
                Комментарий филиала: {order.client.branchComment}
              </p>
            ) : null}
            <div className="order-history-table-wrap">
              <table className="table order-history-table">
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
                      <td>
                        {new Date(o.createdAt).toLocaleDateString('ru-RU')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
