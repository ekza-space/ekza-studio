/** Hub and Studio keep independent accounts/storage. Only explicit model bytes cross this window bridge. */
export const HUB_CHANNEL = 'ekza-studio-embed/v1';
export const HUB_MAX_BYTES = 50 * 1024 * 1024;
const SESSION = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;

export function hubConnection(pageUrl: string): { origin: string; session: string } | null {
  const page = new URL(pageUrl);
  const origin = page.searchParams.get('hub');
  const session = page.searchParams.get('session');
  const allowed =
    page.origin === 'https://studio.dev.ekza.io'
      ? ['https://hub.dev.ekza.io']
      : page.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(page.hostname)
        ? [`http://${page.hostname}:7103`, `http://${page.hostname}:7203`]
        : page.origin === 'https://studio.ekza.io'
          ? ['https://hub.ekza.io']
          : [];
  return origin !== null && allowed.includes(origin) && session !== null && SESSION.test(session)
    ? { origin, session }
    : null;
}

export function hubEnvelope(data: unknown, session: string): data is Record<string, unknown> {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Record<string, unknown>)['channel'] === HUB_CHANNEL &&
    (data as Record<string, unknown>)['session'] === session
  );
}

/** No arbitrary URLs are fetched. Validate the bounded, self-contained VRM before the ordinary importer. */
export async function hubVrmBytes(data: Record<string, unknown>): Promise<Uint8Array> {
  const bytes = data['bytes'];
  const sha256 = data['sha256'];
  if (
    !(bytes instanceof ArrayBuffer) ||
    bytes.byteLength < 20 ||
    bytes.byteLength > HUB_MAX_BYTES ||
    typeof sha256 !== 'string' ||
    !HASH.test(sha256)
  )
    throw new Error('Invalid Hub model payload');
  const view = new DataView(bytes);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength
  )
    throw new Error('Hub model is not a GLB/VRM file');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  if (actual !== sha256) throw new Error('Hub model checksum mismatch');
  return new Uint8Array(bytes);
}

/** Cloud source projects use the same hash/size boundary, then the normal bounded ZIP importer. */
export async function hubProjectBytes(data: Record<string, unknown>): Promise<Uint8Array> {
  const bytes = data['bytes'];
  const expected = data['sha256'];
  if (
    !(bytes instanceof ArrayBuffer) ||
    bytes.byteLength < 4 ||
    bytes.byteLength > HUB_MAX_BYTES ||
    typeof expected !== 'string' ||
    !HASH.test(expected) ||
    new DataView(bytes).getUint32(0, true) !== 0x04034b50
  )
    throw new Error('Invalid Hub project payload');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  if (hash !== expected) throw new Error('Hub project checksum mismatch');
  return new Uint8Array(bytes);
}
