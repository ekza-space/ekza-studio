import { describe, expect, it } from 'vitest';
import { HUB_CHANNEL, hubConnection, hubEnvelope, hubVrmBytes } from '../src/host/hubProtocol';
import { createExportRecorder } from '../src/shell/exports';
import { sha256Hex } from '../src/services/assets';

const session = '12345678-1234-4234-8234-123456789abc';
const page = (origin: string, hub: string) => `${origin}/editor?hub=${encodeURIComponent(hub)}&session=${session}`;

describe('Hub handoff trust boundary', () => {
  it('pairs only the matching contour and rejects arbitrary or credential-bearing origins', () => {
    expect(hubConnection(page('https://studio.ekza.io', 'https://hub.ekza.io'))).toEqual({
      origin: 'https://hub.ekza.io',
      session,
    });
    expect(hubConnection(page('https://studio.dev.ekza.io', 'https://hub.dev.ekza.io'))).not.toBeNull();
    expect(hubConnection(page('http://localhost:3100', 'http://localhost:7103'))).not.toBeNull();
    for (const origin of [
      'https://evil.test',
      'https://hub.ekza.io.evil.test',
      'https://hub.dev.ekza.io',
      'http://localhost:7103',
      'https://user@hub.ekza.io',
    ]) {
      expect(hubConnection(page('https://studio.ekza.io', origin))).toBeNull();
    }
    expect(hubEnvelope({ channel: HUB_CHANNEL, session: 'different' }, session)).toBe(false);
    expect(hubEnvelope({ channel: 'legacy', session }, session)).toBe(false);
  });
  it('rejects corrupt bytes, spoofed hashes and invalid containers before importing', async () => {
    const bytes = new Uint8Array(24);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, 24, true);
    const sha256 = await sha256Hex(bytes);
    expect(await hubVrmBytes({ bytes: bytes.buffer, sha256 })).toEqual(bytes);
    await expect(hubVrmBytes({ bytes: bytes.buffer, sha256: '0'.repeat(64) })).rejects.toThrow('checksum');
    view.setUint32(8, 50, true);
    await expect(hubVrmBytes({ bytes: bytes.buffer, sha256 })).rejects.toThrow('GLB');
    await expect(hubVrmBytes({ bytes: new ArrayBuffer(2), sha256 })).rejects.toThrow('payload');
  });
  it('observes an explicit export without retaining production project bytes after unsubscribe', async () => {
    const recorder = createExportRecorder(false);
    const records: string[] = [];
    const off = recorder.subscribe((file) => records.push(file.sha256));
    const bytes = new Uint8Array([1, 2, 3]);
    recorder.recordDownload({ bytes, fileName: 'avatar.vrm', mime: 'model/gltf-binary' });
    await expect.poll(() => records.length).toBe(1);
    expect(records[0]).toBe(await sha256Hex(bytes));
    expect(recorder.last()).toBeNull();
    off();
    recorder.recordDownload({ bytes, fileName: 'private.ekzanim', mime: 'application/zip' });
    expect(records.length).toBe(1);
  });
});
