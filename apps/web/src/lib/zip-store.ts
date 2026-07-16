/** Минимальный ZIP (STORE, без сжатия) для скачивания нескольких файлов. */

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function encodeName(name: string): Uint8Array {
  return new TextEncoder().encode(name);
}

type ZipEntry = { name: string; data: Uint8Array };

function buildZip(entries: ZipEntry[]): Blob {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encodeName(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const size = data.length;

    const localHeader = concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800), // UTF-8
      u16(0), // store
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);

    localParts.push(localHeader, data);

    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(central);
    offset += localHeader.length + data.length;
  }

  const centralDir = concat(centralParts);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  const zipBytes = concat([...localParts, centralDir, end]);
  return new Blob([zipBytes as unknown as BlobPart], {
    type: 'application/zip',
  });
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Uint8Array(await new Response(blob).arrayBuffer());
}

/** Скачать один или несколько файлов; при >1 — ZIP. */
export async function downloadFilesAsZipOrSingle(
  files: Array<{ name: string; blob: Blob }>,
  zipName: string,
): Promise<void> {
  if (files.length === 0) return;
  if (files.length === 1) {
    triggerDownload(files[0].blob, files[0].name);
    return;
  }

  const used = new Map<string, number>();
  const entries: ZipEntry[] = [];
  for (const f of files) {
    let name = f.name || 'file';
    const n = (used.get(name) ?? 0) + 1;
    used.set(name, n);
    if (n > 1) {
      const dot = name.lastIndexOf('.');
      name =
        dot > 0
          ? `${name.slice(0, dot)}_${n}${name.slice(dot)}`
          : `${name}_${n}`;
    }
    entries.push({
      name,
      data: await blobToBytes(f.blob),
    });
  }
  triggerDownload(
    buildZip(entries),
    zipName.endsWith('.zip') ? zipName : `${zipName}.zip`,
  );
}
