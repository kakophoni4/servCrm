import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadFilesAsZipOrSingle } from './zip-store';

describe('downloadFilesAsZipOrSingle', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('downloads a single file without zip', async () => {
    const click = vi.fn();
    const append = vi.spyOn(document.body, 'appendChild');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);

    await downloadFilesAsZipOrSingle(
      [{ name: 'photo.jpg', blob: new Blob(['abc'], { type: 'image/jpeg' }) }],
      'unused.zip',
    );

    expect(click).toHaveBeenCalled();
    const a = append.mock.calls[0]?.[0] as HTMLAnchorElement;
    expect(a.download).toBe('photo.jpg');
  });

  it('builds a zip for multiple files', async () => {
    const click = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
    const createObjectURL = URL.createObjectURL as ReturnType<typeof vi.fn>;

    await downloadFilesAsZipOrSingle(
      [
        { name: '1.jpg', blob: new Blob(['a'], { type: 'image/jpeg' }) },
        { name: '2.jpg', blob: new Blob(['b'], { type: 'image/jpeg' }) },
      ],
      'docs-договор',
    );

    expect(click).toHaveBeenCalled();
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('application/zip');
    expect(blob.size).toBeGreaterThan(40);
  });
});
