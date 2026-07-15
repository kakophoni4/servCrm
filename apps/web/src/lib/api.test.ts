import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  api,
  getToken,
  setSession,
  clearSession,
  getStoredUser,
  appendFormFields,
  downloadFile,
  type AuthUser,
} from './api';

const mockUser: AuthUser = {
  id: 'u1',
  login: 'dispatcher',
  fullName: 'Иван Иванов',
  role: 'DISPATCHER',
  cityId: 'c1',
  cityName: 'Москва',
};

function createStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => (key in store ? store[key] : null)),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      for (const key of Object.keys(store)) delete store[key];
    }),
    key: vi.fn(),
    get length() {
      return Object.keys(store).length;
    },
    _store: store,
  };
}

describe('api', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', createStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('подставляет Authorization и Content-Type при наличии токена', async () => {
    setSession('secret-token', mockUser);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });

    await api('/users');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/users');
    const headers = options.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer secret-token');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('не ставит Authorization без токена', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });

    await api('/orders');

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Headers;
    expect(headers.get('Authorization')).toBeNull();
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('возвращает JSON при успешном ответе', async () => {
    const payload = { id: '1', name: 'Заявка' };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
    });

    const result = await api<typeof payload>('/orders/1');

    expect(result).toEqual(payload);
  });

  it('возвращает undefined при статусе 204', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
    });

    const result = await api('/orders/1');

    expect(result).toBeUndefined();
  });

  it('бросает ошибку с message-строкой при !ok', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'Неверные данные' }),
    });

    await expect(api('/bad')).rejects.toThrow('Неверные данные');
  });

  it('бросает ошибку с message-массивом при !ok', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ message: ['Поле A', 'Поле B'] }),
    });

    await expect(api('/bad')).rejects.toThrow('Поле A, Поле B');
  });

  it('бросает дефолтное сообщение, если тело ошибки не парсится', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('invalid json')),
    });

    await expect(api('/bad')).rejects.toThrow('Ошибка 500');
  });

  it('формирует URL как ${API_URL}/api${path}', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    await api('/settings/dispatcher-pay');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/settings/dispatcher-pay');
  });
});

describe('appendFormFields', () => {
  it('пропускает undefined, null и пустые строки', () => {
    const formData = new FormData();
    appendFormFields(formData, {
      keep: 'значение',
      skipUndefined: undefined,
      skipNull: null,
      skipEmpty: '',
      skipWhitespace: '   ',
      file: new Blob(['x'], { type: 'text/plain' }),
    });

    const entries = [...formData.entries()];
    expect(entries).toHaveLength(2);
    expect(entries).toContainEqual(['keep', 'значение']);
    expect(entries[1][0]).toBe('file');
    expect(entries[1][1]).toBeInstanceOf(Blob);
  });
});

describe('session helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('setSession / getToken / getStoredUser — round-trip через localStorage', () => {
    setSession('jwt-abc', mockUser);

    expect(getToken()).toBe('jwt-abc');
    expect(getStoredUser()).toEqual(mockUser);
  });

  it('clearSession удаляет токен и пользователя', () => {
    setSession('jwt-abc', mockUser);
    clearSession();

    expect(getToken()).toBeNull();
    expect(getStoredUser()).toBeNull();
  });

  it('getStoredUser возвращает null при битом JSON', () => {
    localStorage.setItem('crm_user', '{not valid json');

    expect(getStoredUser()).toBeNull();
  });
});

describe('downloadFile', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', createStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('скачивает blob, кликает по ссылке и вызывает revokeObjectURL', async () => {
    setSession('dl-token', mockUser);
    const blob = new Blob(['pdf-content'], { type: 'application/pdf' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(blob),
    });

    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});

    const clickMock = vi.fn();
    const removeMock = vi.fn();
    const anchor = {
      href: '',
      download: '',
      click: clickMock,
      remove: removeMock,
    } as unknown as HTMLAnchorElement;

    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    vi.spyOn(document.body, 'appendChild').mockImplementation(
      (node) => node,
    );

    await downloadFile('/files/doc-1', 'report.pdf');

    expect(fetchMock).toHaveBeenCalledWith('/api/files/doc-1', {
      headers: expect.any(Headers),
    });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit)
      .headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer dl-token');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor.href).toBe('blob:mock-url');
    expect(anchor.download).toBe('report.pdf');
    expect(clickMock).toHaveBeenCalledOnce();
    expect(removeMock).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('бросает ошибку при !ok', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: 'Доступ запрещён' }),
    });

    await expect(downloadFile('/files/secret', 'x.pdf')).rejects.toThrow(
      'Доступ запрещён',
    );
  });
});
