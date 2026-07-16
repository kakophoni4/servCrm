'use client';

import { FormEvent, useEffect, useState } from 'react';
import { OpsShell } from '@/components/ops/OpsShell';
import {
  api,
  downloadFile,
  fetchAuthorizedBlob,
  uploadFiles,
} from '@/lib/api';

type AdReport = {
  id: string;
  reportDate: string;
  promotersCount: number;
  leafletsIssued: number;
  leafletsSpread: number;
  cardsIssued: number;
  cardsSpread: number;
  stickersIssued: number;
  stickersSpread: number;
  avitoAdsCount: number;
  leafletsStock: number;
  cardsStock: number;
  documentPath?: string | null;
  createdAt: string;
  city?: { name: string } | null;
  createdBy?: { fullName: string } | null;
};

type FormState = {
  reportDate: string;
  promotersCount: string;
  leafletsIssued: string;
  leafletsSpread: string;
  cardsIssued: string;
  cardsSpread: string;
  stickersIssued: string;
  stickersSpread: string;
  avitoAdsCount: string;
  leafletsStock: string;
  cardsStock: string;
};

type DocPreview = {
  id: string;
  fileName: string;
  mimeType: string;
  url: string;
};

const emptyForm = (): FormState => ({
  reportDate: new Date().toISOString().slice(0, 10),
  promotersCount: '',
  leafletsIssued: '',
  leafletsSpread: '',
  cardsIssued: '',
  cardsSpread: '',
  stickersIssued: '',
  stickersSpread: '',
  avitoAdsCount: '',
  leafletsStock: '',
  cardsStock: '',
});

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

function fileNameFromPath(path: string, id: string): string {
  return path.split('/').pop() || `ad-${id}`;
}

export default function AdsPage() {
  const [reports, setReports] = useState<AdReport[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<DocPreview | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [downloadLoadingId, setDownloadLoadingId] = useState<string | null>(
    null,
  );

  async function load() {
    setReports(await api<AdReport[]>('/ads'));
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, []);

  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setNum(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/ads', {
        method: 'POST',
        body: JSON.stringify({
          reportDate: form.reportDate,
          promotersCount: Number(form.promotersCount),
          leafletsIssued: Number(form.leafletsIssued),
          leafletsSpread: Number(form.leafletsSpread),
          cardsIssued: Number(form.cardsIssued),
          cardsSpread: Number(form.cardsSpread),
          stickersIssued: Number(form.stickersIssued),
          stickersSpread: Number(form.stickersSpread),
          avitoAdsCount: Number(form.avitoAdsCount),
          leafletsStock: Number(form.leafletsStock),
          cardsStock: Number(form.cardsStock),
        }),
      });
      setForm(emptyForm());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function uploadScreenshot(id: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', files[0]);
      await uploadFiles(`/ads/${id}/screenshot`, fd);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    }
  }

  function closePreview() {
    setPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  async function openPreview(report: AdReport) {
    if (!report.documentPath) return;
    setError('');
    setPreviewLoadingId(report.id);
    try {
      const fileName = fileNameFromPath(report.documentPath, report.id);
      const blob = await fetchAuthorizedBlob(`/ads/${report.id}/screenshot`);
      const mime = blob.type || guessMimeFromName(fileName);
      const url = URL.createObjectURL(
        blob.type ? blob : new Blob([blob], { type: mime }),
      );
      setPreview((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { id: report.id, fileName, mimeType: mime, url };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка предпросмотра');
    } finally {
      setPreviewLoadingId(null);
    }
  }

  async function downloadScreenshot(report: AdReport) {
    if (!report.documentPath) return;
    setError('');
    setDownloadLoadingId(report.id);
    try {
      const fileName = fileNameFromPath(report.documentPath, report.id);
      await downloadFile(`/ads/${report.id}/screenshot`, fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка скачивания');
    } finally {
      setDownloadLoadingId(null);
    }
  }

  return (
    <OpsShell>
      <div className="ads-page">
        <form className="panel ads-form" onSubmit={onSubmit}>
          <div className="ads-form-head">
            <h2 className="ads-form-title">Новый отчёт</h2>
          </div>

          <div className="ads-form-meta">
            <div className="field">
              <label>Дата</label>
              <input
                type="date"
                required
                value={form.reportDate}
                onChange={(e) => setNum('reportDate', e.target.value)}
              />
            </div>
            <div className="field">
              <label>Промоутеров</label>
              <input
                inputMode="numeric"
                value={form.promotersCount}
                onChange={(e) => setNum('promotersCount', e.target.value)}
              />
            </div>
            <div className="field">
              <label>Авито</label>
              <input
                inputMode="numeric"
                value={form.avitoAdsCount}
                onChange={(e) => setNum('avitoAdsCount', e.target.value)}
              />
            </div>
          </div>

          <div className="ads-matrix-wrap">
            <table className="ads-matrix">
              <thead>
                <tr>
                  <th></th>
                  <th>Выдано</th>
                  <th>Разнесено</th>
                  <th>Остаток</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Листовки</td>
                  <td>
                    <input
                      inputMode="numeric"
                      value={form.leafletsIssued}
                      onChange={(e) => setNum('leafletsIssued', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      inputMode="numeric"
                      value={form.leafletsSpread}
                      onChange={(e) => setNum('leafletsSpread', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      inputMode="numeric"
                      value={form.leafletsStock}
                      onChange={(e) => setNum('leafletsStock', e.target.value)}
                    />
                  </td>
                </tr>
                <tr>
                  <td>Визитки</td>
                  <td>
                    <input
                      inputMode="numeric"
                      value={form.cardsIssued}
                      onChange={(e) => setNum('cardsIssued', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      inputMode="numeric"
                      value={form.cardsSpread}
                      onChange={(e) => setNum('cardsSpread', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      inputMode="numeric"
                      value={form.cardsStock}
                      onChange={(e) => setNum('cardsStock', e.target.value)}
                    />
                  </td>
                </tr>
                <tr>
                  <td>Наклейки</td>
                  <td>
                    <input
                      inputMode="numeric"
                      value={form.stickersIssued}
                      onChange={(e) => setNum('stickersIssued', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      inputMode="numeric"
                      value={form.stickersSpread}
                      onChange={(e) => setNum('stickersSpread', e.target.value)}
                    />
                  </td>
                  <td className="muted">—</td>
                </tr>
              </tbody>
            </table>
          </div>

          <button className="btn ads-form-submit" type="submit">
            Сохранить отчёт
          </button>
        </form>

        <div className="panel">
          {error ? <p className="error">{error}</p> : null}
          <div className="table-scroll">
            <table className="table ads-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Филиал</th>
                  <th>Промоутеры</th>
                  <th>Листовки</th>
                  <th>Визитки</th>
                  <th>Авито</th>
                  <th>Кто</th>
                  <th>Скрин</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.reportDate).toLocaleDateString('ru-RU')}</td>
                    <td>{r.city?.name ?? '—'}</td>
                    <td>{r.promotersCount}</td>
                    <td>
                      {r.leafletsSpread}/{r.leafletsIssued} (ост.{' '}
                      {r.leafletsStock})
                    </td>
                    <td>
                      {r.cardsSpread}/{r.cardsIssued} (ост. {r.cardsStock})
                    </td>
                    <td>{r.avitoAdsCount}</td>
                    <td>{r.createdBy?.fullName ?? '—'}</td>
                    <td>
                      {r.documentPath ? (
                        <div className="docs-actions">
                          <button
                            type="button"
                            className="btn-link"
                            disabled={previewLoadingId === r.id}
                            onClick={() => void openPreview(r)}
                          >
                            {previewLoadingId === r.id ? '…' : 'Предпросмотр'}
                          </button>
                          <button
                            type="button"
                            className="btn-link"
                            disabled={downloadLoadingId === r.id}
                            onClick={() => void downloadScreenshot(r)}
                          >
                            {downloadLoadingId === r.id ? '…' : 'Скачать'}
                          </button>
                        </div>
                      ) : (
                        <label className="file-picker ads-upload">
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) =>
                              uploadScreenshot(r.id, e.target.files)
                            }
                          />
                          <span className="file-picker-title">Загрузить</span>
                          <span className="file-picker-hint">фото или PDF</span>
                        </label>
                      )}
                    </td>
                  </tr>
                ))}
                {reports.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="muted">
                      Отчётов пока нет.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {preview ? (
          <div
            className="doc-preview-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Скрин отчёта"
            onClick={closePreview}
          >
            <div
              className="doc-preview-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="doc-preview-head">
                <div>
                  <strong>Скрин</strong>
                </div>
                <div className="docs-actions">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      const report = reports.find((x) => x.id === preview.id);
                      if (report) void downloadScreenshot(report);
                    }}
                  >
                    Скачать
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
                {previewLoadingId === preview.id ? (
                  <p className="muted">Загрузка…</p>
                ) : preview.mimeType.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview.url}
                    alt="Скрин отчёта"
                    className="doc-preview-image"
                  />
                ) : preview.mimeType === 'application/pdf' ||
                  preview.fileName.toLowerCase().endsWith('.pdf') ? (
                  <iframe
                    title="Скрин отчёта"
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
      </div>
    </OpsShell>
  );
}
