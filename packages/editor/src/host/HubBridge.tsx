import { type JSX, useEffect, useRef, useState } from 'react';
import type { LastExport } from '../shell/types';
import type { HostShell } from './types';
import { HUB_CHANNEL, HUB_MAX_BYTES, hubConnection, hubEnvelope, hubProjectBytes, hubVrmBytes } from './hubProtocol';

/** Lazy, opt-in bridge. The user's Export command still downloads a file; returning it is a separate click. */
export default function HubBridge({ host }: { readonly host: HostShell }): JSX.Element | null {
  const [connection] = useState(() => hubConnection(window.location.href));
  const [status, setStatus] = useState(() =>
    window.opener === null ? 'Keep the Hub tab open and launch Studio from it.' : 'Waiting for the model from Hub…',
  );
  const [file, setFile] = useState<LastExport | null>(null);
  const [sent, setSent] = useState(false);
  const [project, setProject] = useState<LastExport | null>(null);
  const [projectEnabled, setProjectEnabled] = useState(false);
  const [projectSaved, setProjectSaved] = useState(false);
  const projectDigest = useRef<string | null>(null);
  useEffect(() => {
    if (connection === null) return undefined;
    const peer = window.opener as Window | null;
    if (peer === null) {
      return undefined;
    }
    let live = true;
    let received = false;
    const post = (data: Record<string, unknown>) =>
      peer.postMessage({ channel: HUB_CHANNEL, session: connection.session, ...data }, connection.origin);
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== peer || event.origin !== connection.origin || !hubEnvelope(event.data, connection.session))
        return;
      const data = event.data;
      if (data['type'] === 'error') {
        setStatus(
          typeof data['message'] === 'string'
            ? data['message'].slice(0, 500)
            : 'Hub could not save this export. Try again.',
        );
        return;
      }
      if (data['type'] === 'connected') {
        received = true;
        setProjectEnabled(data['projectEnabled'] === true);
        setStatus('Connected to Hub. Save an editable project or export a VRM when ready.');
        return;
      }
      if (data['type'] === 'project-saved') {
        if (data['sha256'] !== projectDigest.current) {
          setStatus('An earlier project snapshot was saved. Save the current version when ready.');
          return;
        }
        setStatus('Editable project saved to your Hub account. You can resume it from Workspace.');
        setProjectSaved(true);
        return;
      }
      if (data['type'] === 'saved') {
        setStatus('Export saved in Hub. Return there to review and upload it.');
        setSent(true);
        return;
      }
      if (data['type'] !== 'open' || received) return;
      received = true;
      setStatus('Checking model…');
      setProjectEnabled(data['projectEnabled'] === true);
      const isProject = data['format'] === 'ekzanim';
      void (isProject ? hubProjectBytes(data) : hubVrmBytes(data))
        .then(async (bytes) => {
          if (!live) return;
          const name =
            typeof data['name'] === 'string' ? data['name'].slice(0, 120).replace(/[\\/]/g, '_') : 'Library avatar';
          await host.files.openFile(`${name}.${isProject ? 'ekzanim' : 'vrm'}`, bytes, { waitForDialog: true });
          if (!live) return;
          setStatus('Animate, save your project, then export “Bake into model” with slot clips.');
          post({ type: 'opened' });
        })
        .catch((error: unknown) => {
          if (!live) return;
          const message = error instanceof Error ? error.message : 'Model import failed';
          setStatus(message);
          post({ type: 'error', message });
        });
    };
    window.addEventListener('message', receive);
    const ready = () => {
      if (!received) post({ type: 'ready', capabilities: ['project-v1', 'imported-pbr-base-color/v1'] });
    };
    ready();
    const timer = window.setInterval(ready, 1000);
    const unsubscribe = host.exports.subscribe((record) => {
      if (/\.ekzanim$/i.test(record.fileName)) {
        projectDigest.current = record.sha256;
        setProject(record.bytes.byteLength <= HUB_MAX_BYTES ? record : null);
        setProjectSaved(false);
      }
      if (/\.vrm$/i.test(record.fileName)) {
        if (record.bytes.byteLength > HUB_MAX_BYTES) {
          setFile(null);
          setStatus('This VRM exceeds the Hub limit of 50 MiB. Reduce its size and export again.');
          return;
        }
        setFile(record);
        setSent(false);
        setStatus('VRM exported. Send this exported version to Hub when ready.');
      }
    });
    return () => {
      live = false;
      clearInterval(timer);
      unsubscribe();
      window.removeEventListener('message', receive);
    };
  }, [connection, host]);
  if (connection === null) return null;
  const saveProject = () => {
    if (project === null || connection === null || window.opener === null || (window.opener as Window).closed) {
      setStatus('Keep the Hub tab open to save. Your local .ekzanim download remains available.');
      return;
    }
    const bytes = project.bytes.slice().buffer;
    (window.opener as Window).postMessage(
      { channel: HUB_CHANNEL, session: connection.session, type: 'project', sha256: project.sha256, bytes },
      connection.origin,
      [bytes],
    );
    setStatus('Saving editable project to Hub…');
  };
  const send = () => {
    if (file === null) return;
    if (window.opener === null || (window.opener as Window).closed) {
      setStatus('The Hub tab was closed. Keep your exported file and upload it in Hub.');
      return;
    }
    const bytes = file.bytes.slice().buffer;
    (window.opener as Window).postMessage(
      {
        channel: HUB_CHANNEL,
        session: connection.session,
        type: 'exported',
        fileName: file.fileName,
        sha256: file.sha256,
        bytes,
      },
      connection.origin,
      [bytes],
    );
    setStatus('Saving exported VRM in Hub…');
  };
  return (
    <section
      aria-label="Hub handoff"
      className="fixed bottom-8 right-3 z-50 max-w-sm rounded border border-line bg-popover p-3 text-ui text-fg shadow-popover"
    >
      <strong>Library → Studio → Hub → OMOBA</strong>
      <output className="my-2 block">{status}</output>
      <p className="my-2 text-fg-3">
        Save .ekzanim to keep editable animation tracks. Sending a VRM does not publish it or submit it to a game.
      </p>
      {projectEnabled ? (
        <button
          type="button"
          className="mb-2 rounded border border-line px-3 py-2 disabled:opacity-50"
          disabled={project === null || projectSaved}
          onClick={saveProject}
        >
          {projectSaved ? 'Project saved in Hub' : 'Save project to Hub'}
        </button>
      ) : null}
      <button
        type="button"
        className="rounded border border-line px-3 py-2 disabled:opacity-50"
        disabled={file === null || sent}
        onClick={send}
      >
        {sent ? 'Saved in Hub' : 'Send exported VRM to Hub'}
      </button>
    </section>
  );
}
