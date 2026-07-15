/** Пусто = relative /api (same-origin через Caddy / IP без домена). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export type AuthUser = {
  id: string;
  login: string;
  fullName: string;
  role: string;
  cityId?: string | null;
  cityName?: string | null;
};

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('crm_token');
}

export function setSession(token: string, user: AuthUser) {
  localStorage.setItem('crm_token', token);
  localStorage.setItem('crm_user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('crm_token');
  localStorage.removeItem('crm_user');
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('crm_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = `Ошибка ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) message = body.message.join(', ');
      else if (body.message) message = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function parseError(res: Response): Promise<string> {
  let message = `Ошибка ${res.status}`;
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) message = body.message.join(', ');
    else if (body.message) message = body.message;
  } catch {
    /* ignore */
  }
  return message;
}

/** Загрузка файлов через multipart/form-data (без Content-Type — его ставит браузер). */
export async function uploadFiles<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_URL}/api${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) throw new Error(await parseError(res));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Добавляет в FormData только непустые строковые/файловые поля. */
export function appendFormFields(
  formData: FormData,
  fields: Record<string, string | Blob | File | null | undefined>,
): FormData {
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    formData.append(key, value);
  }
  return formData;
}

/** Скачивание защищённого файла с авторизацией и сохранением на диск. */
export async function downloadFile(
  path: string,
  fileName: string,
): Promise<void> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_URL}/api${path}`, { headers });
  if (!res.ok) throw new Error(await parseError(res));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Расчёт ЗП одного диспетчера за период. */
export type DispatcherPayCalc = {
  userId: string;
  fullName: string;
  period: { from: string; to: string };
  salaryBase: number;
  dailyTurnoverPay: number;
  leafletsPay: number;
  closedOrdersBonus: number;
  total: number;
  meta?: {
    turnover: number;
    leaflets: number;
    ownClosedNet: number;
    settings: {
      salaryBase: number;
      dailyTurnoverPct: number;
      leafletBonus: number;
      closedOrdersBonusPct: number;
    };
  };
};

export function getDispatcherPayCalc(
  userId: string,
  from: string,
  to: string,
) {
  const q = new URLSearchParams({ from, to });
  return api<DispatcherPayCalc>(
    `/settings/dispatcher-pay/${userId}/calc?${q}`,
  );
}

export function getDispatcherPaySummary(from: string, to: string) {
  const q = new URLSearchParams({ from, to });
  return api<DispatcherPayCalc[]>(
    `/settings/dispatcher-pay/summary?${q}`,
  );
}

/** Заявка для всплывающего уведомления в CRM. */
export type RecentOrder = {
  id: string;
  publicId: string;
  clientName: string;
  phone: string;
  address: string;
  cityName: string | null;
  status: string;
  hasMaster: boolean;
  createdAt: string;
};

/** Новые заявки, созданные после `after` (ISO). Только для админов. */
export function getRecentOrders(after: string) {
  const q = new URLSearchParams({ after });
  return api<RecentOrder[]>(`/orders/recent?${q}`);
}
