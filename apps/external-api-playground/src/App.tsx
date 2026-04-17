import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { DEFAULT_DEV_KEYS } from './dev-defaults';
import { EXTERNAL_ENDPOINTS } from './endpoints';
import {
  buildMultipartAuthHeaders,
  buildSignedJsonRequest,
  mergeJsonForSigning,
} from './hmac';

const LS = {
  payinPk: 'p2p-external-playground-payin-pk',
  payinSk: 'p2p-external-playground-payin-sk',
  payoutPk: 'p2p-external-playground-payout-pk',
  payoutSk: 'p2p-external-playground-payout-sk',
  lastEndpoint: 'p2p-external-playground-last-endpoint',
  useV2: 'p2p-external-playground-use-v2',
} as const;

function loadKeys() {
  return {
    payinPublicKey:
      localStorage.getItem(LS.payinPk) ?? DEFAULT_DEV_KEYS.payinPublicKey,
    payinSecret: localStorage.getItem(LS.payinSk) ?? DEFAULT_DEV_KEYS.payinSecret,
    payoutPublicKey:
      localStorage.getItem(LS.payoutPk) ?? DEFAULT_DEV_KEYS.payoutPublicKey,
    payoutSecret:
      localStorage.getItem(LS.payoutSk) ?? DEFAULT_DEV_KEYS.payoutSecret,
  };
}

const STATUS_OPTIONS = ['VERIFIED', 'CANCELED'] as const;

export function App() {
  const [keys, setKeys] = useState(loadKeys);
  const [endpointId, setEndpointId] = useState(
    () => localStorage.getItem(LS.lastEndpoint) ?? EXTERNAL_ENDPOINTS[0].id,
  );
  const [useV2, setUseV2] = useState(() => localStorage.getItem(LS.useV2) === '1');
  const [bodyJson, setBodyJson] = useState('');
  const [multipart, setMultipart] = useState({
    status: 'VERIFIED' as (typeof STATUS_OPTIONS)[number],
    proofId: '',
    proofNonce: String(Math.floor(Date.now() / 1000)),
    appealOrderId: '',
    appealPaidAmount: '100',
    appealNonce: String(Date.now()),
    proofFiles: null as FileList | null,
    appealFiles: null as FileList | null,
  });

  const [loading, setLoading] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [statusLine, setStatusLine] = useState('');
  /** Used only to preview v2 body when `nonce` is omitted (stable until refreshed). */
  const [previewNonce, setPreviewNonce] = useState(() =>
    Math.floor(Date.now() / 1000),
  );

  const endpoint = useMemo(
    () => EXTERNAL_ENDPOINTS.find((e) => e.id === endpointId) ?? EXTERNAL_ENDPOINTS[0],
    [endpointId],
  );

  useEffect(() => {
    localStorage.setItem(LS.payinPk, keys.payinPublicKey);
    localStorage.setItem(LS.payinSk, keys.payinSecret);
    localStorage.setItem(LS.payoutPk, keys.payoutPublicKey);
    localStorage.setItem(LS.payoutSk, keys.payoutSecret);
  }, [keys]);

  useEffect(() => {
    localStorage.setItem(LS.lastEndpoint, endpointId);
  }, [endpointId]);

  useEffect(() => {
    localStorage.setItem(LS.useV2, useV2 ? '1' : '0');
  }, [useV2]);

  useEffect(() => {
    setPreviewNonce(Math.floor(Date.now() / 1000));
  }, [endpointId, useV2]);

  useEffect(() => {
    if (endpoint.kind === 'json') {
      setBodyJson(endpoint.defaultJson);
    }
  }, [endpoint.id, endpoint.kind, endpoint.defaultJson]);

  const jsonPreviewMerged = useMemo(() => {
    if (endpoint.kind !== 'json') return null;
    try {
      const parsed = JSON.parse(bodyJson) as Record<string, unknown>;
      return mergeJsonForSigning(parsed, endpoint.path, useV2, previewNonce);
    } catch {
      return null;
    }
  }, [bodyJson, endpoint.kind, endpoint.path, useV2, previewNonce]);

  const insertNonceIntoJson = () => {
    try {
      const parsed = JSON.parse(bodyJson) as Record<string, unknown>;
      const next = { ...parsed, nonce: previewNonce };
      setBodyJson(JSON.stringify(next, null, 2));
      setStatusLine('');
    } catch {
      setStatusLine('Fix JSON before inserting nonce');
    }
  };

  const publicKey = endpoint.direction === 'payin' ? keys.payinPublicKey : keys.payoutPublicKey;
  const secret = endpoint.direction === 'payin' ? keys.payinSecret : keys.payoutSecret;

  const sendJson = useCallback(async () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(bodyJson) as Record<string, unknown>;
    } catch {
      setStatusLine('Invalid JSON body');
      setResponseText('');
      return;
    }

    setLoading(true);
    setStatusLine('');
    setResponseText('');
    try {
      const { headers, bodyString } = await buildSignedJsonRequest({
        publicKey,
        secret,
        body: parsed,
        apiUrl: endpoint.path,
        useV2,
      });
      const res = await fetch(endpoint.path, {
        method: 'POST',
        headers,
        body: bodyString,
      });
      const raw = await res.text();
      setStatusLine(`${res.status} ${res.statusText}`);
      try {
        setResponseText(JSON.stringify(JSON.parse(raw), null, 2));
      } catch {
        setResponseText(raw);
      }
    } catch (e) {
      setStatusLine('Request failed');
      setResponseText(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [bodyJson, endpoint.path, publicKey, secret, useV2]);

  const sendMultipartProofs = useCallback(async () => {
    const nonce = parseUnixNonce(multipart.proofNonce);
    if (nonce === null) {
      setStatusLine('Invalid nonce (use Unix seconds)');
      return;
    }
    const formula = `id=${multipart.proofId};status=${multipart.status};nonce=${nonce}`;
    setLoading(true);
    setStatusLine('');
    setResponseText('');
    try {
      const { headers } = await buildMultipartAuthHeaders({
        publicKey,
        secret,
        formula,
      });
      const fd = new FormData();
      fd.append('id', multipart.proofId);
      fd.append('status', multipart.status);
      if (multipart.proofFiles) {
        for (let i = 0; i < multipart.proofFiles.length; i++) {
          fd.append('files', multipart.proofFiles[i]);
        }
      }
      const res = await fetch(endpoint.path, { method: 'POST', headers, body: fd });
      const raw = await res.text();
      setStatusLine(`${res.status} ${res.statusText}`);
      try {
        setResponseText(JSON.stringify(JSON.parse(raw), null, 2));
      } catch {
        setResponseText(raw);
      }
    } catch (e) {
      setStatusLine('Request failed');
      setResponseText(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [
    endpoint.path,
    multipart.proofId,
    multipart.proofFiles,
    multipart.proofNonce,
    multipart.status,
    publicKey,
    secret,
  ]);

  const sendMultipartAppeal = useCallback(async () => {
    const paid = Number(multipart.appealPaidAmount);
    if (!multipart.appealOrderId || !Number.isFinite(paid) || paid <= 0) {
      setStatusLine('order_id and positive paid_amount required');
      return;
    }
    const nonceNum = Number(multipart.appealNonce);
    if (!Number.isFinite(nonceNum)) {
      setStatusLine('Invalid nonce');
      return;
    }
    const formula = `order_id=${multipart.appealOrderId};paid_amount=${paid};nonce=${nonceNum}`;
    setLoading(true);
    setStatusLine('');
    setResponseText('');
    try {
      const { headers } = await buildMultipartAuthHeaders({
        publicKey,
        secret,
        formula,
      });
      const fd = new FormData();
      fd.append('order_id', multipart.appealOrderId);
      fd.append('paid_amount', String(paid));
      fd.append('nonce', String(nonceNum));
      if (multipart.appealFiles) {
        for (let i = 0; i < multipart.appealFiles.length; i++) {
          fd.append('files', multipart.appealFiles[i]);
        }
      }
      const res = await fetch(endpoint.path, { method: 'POST', headers, body: fd });
      const raw = await res.text();
      setStatusLine(`${res.status} ${res.statusText}`);
      try {
        setResponseText(JSON.stringify(JSON.parse(raw), null, 2));
      } catch {
        setResponseText(raw);
      }
    } catch (e) {
      setStatusLine('Request failed');
      setResponseText(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [
    endpoint.path,
    multipart.appealFiles,
    multipart.appealOrderId,
    multipart.appealPaidAmount,
    multipart.appealNonce,
    publicKey,
    secret,
  ]);

  const send = () => {
    if (!publicKey.trim() || !secret.trim()) {
      setStatusLine('Set public key and secret for this direction');
      return;
    }
    if (endpoint.kind === 'json') {
      void sendJson();
    } else if (endpoint.multipart === 'update_order_with_proofs') {
      void sendMultipartProofs();
    } else {
      void sendMultipartAppeal();
    }
  };

  return (
    <div style={layout.app}>
      <header style={layout.header}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
          External API playground
        </h1>
        <p style={{ margin: '0.35rem 0 0', color: '#9aa0ae', fontSize: '0.85rem', maxWidth: '52rem' }}>
          Local-only HMAC tester for <code>/api/external/v1</code>. Keys are stored in{' '}
          <code>localStorage</code> (development use only). Requests are proxied to the API (see{' '}
          <code>EXTERNAL_PLAYGROUND_API_TARGET</code>). First visit loads sample keys from{' '}
          <code>dev-defaults.ts</code> until you overwrite them.
        </p>
      </header>

      <div style={layout.main}>
        <aside style={layout.aside}>
          <h2 style={sectionTitle}>Keys</h2>
          <label style={label}>Pay-In public key (pk_payin_…)</label>
          <input
            style={input}
            value={keys.payinPublicKey}
            onChange={(e) => setKeys((k) => ({ ...k, payinPublicKey: e.target.value }))}
            autoComplete="off"
            spellCheck={false}
          />
          <label style={label}>Pay-In secret (sk_payin_…)</label>
          <input
            style={{ ...input, fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem' }}
            type="text"
            value={keys.payinSecret}
            onChange={(e) => setKeys((k) => ({ ...k, payinSecret: e.target.value }))}
            autoComplete="off"
            spellCheck={false}
          />
          <label style={label}>Pay-Out public key (pk_payout_…)</label>
          <input
            style={input}
            value={keys.payoutPublicKey}
            onChange={(e) => setKeys((k) => ({ ...k, payoutPublicKey: e.target.value }))}
            autoComplete="off"
            spellCheck={false}
          />
          <label style={label}>Pay-Out secret (sk_payout_…)</label>
          <input
            style={{ ...input, fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem' }}
            type="text"
            value={keys.payoutSecret}
            onChange={(e) => setKeys((k) => ({ ...k, payoutSecret: e.target.value }))}
            autoComplete="off"
            spellCheck={false}
          />

          <h2 style={{ ...sectionTitle, marginTop: '1.25rem' }}>Endpoint</h2>
          <select
            style={input}
            value={endpointId}
            onChange={(e) => setEndpointId(e.target.value)}
          >
            {EXTERNAL_ENDPOINTS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>

          {endpoint.kind === 'json' && (
            <>
              <label
                style={{
                  ...label,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={useV2}
                  onChange={(e) => setUseV2(e.target.checked)}
                  style={{ marginTop: '0.2rem' }}
                />
                <span>
                  HMAC v2 — binds <code>api_url</code> + requires <code>nonce</code>
                </span>
              </label>
              <p style={helpAside}>
                When this is on, the playground <strong>adds</strong> <code>api_url</code> (this
                endpoint path) and <code>nonce</code> (Unix seconds) <em>after</em> you edit the
                JSON, then signs that merged object. You do not need to type <code>api_url</code> in
                the editor — that is why requests work without it in the textarea.
              </p>
            </>
          )}

          <p style={{ fontSize: '0.75rem', color: '#7a7f8c', margin: '0.75rem 0 0' }}>
            Active: <strong>{endpoint.direction}</strong> keys ·{' '}
            <code style={{ fontSize: '0.7rem' }}>{endpoint.path}</code>
          </p>
        </aside>

        <section style={layout.center}>
          <h2 style={sectionTitle}>Request</h2>
          {endpoint.kind === 'json' ? (
            <>
              <textarea
                style={textarea}
                value={bodyJson}
                onChange={(e) => setBodyJson(e.target.value)}
                spellCheck={false}
              />
              <div style={btnRow}>
                <button
                  type="button"
                  style={btnSecondary}
                  onClick={() => setPreviewNonce(Math.floor(Date.now() / 1000))}
                >
                  Refresh preview nonce
                </button>
                <button type="button" style={btnSecondary} onClick={() => insertNonceIntoJson()}>
                  Write nonce into JSON
                </button>
              </div>
              <p style={help}>
                <strong>Nonce</strong> = Unix time in <strong>seconds</strong> (replay protection).
                HMAC v2 requires it. v1 JSON: optional. Multipart: required in the signature line.
                If you omit <code>nonce</code> in JSON under v2, Send uses the current second at click
                time (preview uses the value above after refresh).
              </p>
              {bodyJson.trim() && jsonPreviewMerged === null && (
                <p style={{ ...help, color: '#f88', marginTop: '0.35rem' }}>
                  Invalid JSON — fix the editor to see the signed-body preview.
                </p>
              )}
              {jsonPreviewMerged !== null && (
                <details style={{ marginBottom: '0.75rem' }}>
                  <summary style={{ cursor: 'pointer', color: '#b4bac8', fontSize: '0.85rem' }}>
                    JSON actually signed (after v2 merge)
                  </summary>
                  <pre style={{ ...pre, marginTop: '0.5rem', maxHeight: '200px' }}>
                    {JSON.stringify(jsonPreviewMerged, null, 2)}
                  </pre>
                </details>
              )}
            </>
          ) : endpoint.multipart === 'update_order_with_proofs' ? (
            <div style={block}>
              <label style={label}>Order id (UUID)</label>
              <input
                style={input}
                value={multipart.proofId}
                onChange={(e) =>
                  setMultipart((m) => ({ ...m, proofId: e.target.value }))
                }
              />
              <label style={label}>Status</label>
              <select
                style={input}
                value={multipart.status}
                onChange={(e) =>
                  setMultipart((m) => ({
                    ...m,
                    status: e.target.value as (typeof STATUS_OPTIONS)[number],
                  }))
                }
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <label style={label}>
                Nonce (Unix seconds — must match the signed payload line)
              </label>
              <input
                style={input}
                value={multipart.proofNonce}
                onChange={(e) =>
                  setMultipart((m) => ({ ...m, proofNonce: e.target.value }))
                }
              />
              <p style={help}>
                Same nonce is embedded in <code>id=…;status=…;nonce=…</code> and signed. Use a new
                value if the server says nonce was already used.
              </p>
              <label style={label}>Proof files</label>
              <input
                type="file"
                multiple
                style={fileInput}
                onChange={(e) =>
                  setMultipart((m) => ({ ...m, proofFiles: e.target.files }))
                }
              />
            </div>
          ) : (
            <div style={block}>
              <label style={label}>order_id</label>
              <input
                style={input}
                value={multipart.appealOrderId}
                onChange={(e) =>
                  setMultipart((m) => ({ ...m, appealOrderId: e.target.value }))
                }
              />
              <label style={label}>paid_amount</label>
              <input
                style={input}
                value={multipart.appealPaidAmount}
                onChange={(e) =>
                  setMultipart((m) => ({ ...m, appealPaidAmount: e.target.value }))
                }
              />
              <label style={label}>
                Nonce (seconds or milliseconds — server accepts both)
              </label>
              <input
                style={input}
                value={multipart.appealNonce}
                onChange={(e) =>
                  setMultipart((m) => ({ ...m, appealNonce: e.target.value }))
                }
              />
              <p style={help}>
                Must match <code>order_id=…;paid_amount=…;nonce=…</code> in the signed form fields.
                Default is milliseconds (e.g. <code>Date.now()</code>).
              </p>
              <label style={label}>Proof files</label>
              <input
                type="file"
                multiple
                style={fileInput}
                onChange={(e) =>
                  setMultipart((m) => ({ ...m, appealFiles: e.target.files }))
                }
              />
            </div>
          )}

          <button
            type="button"
            style={button}
            disabled={loading}
            onClick={() => send()}
          >
            {loading ? 'Sending…' : 'Send request'}
          </button>
        </section>

        <section style={layout.right}>
          <h2 style={sectionTitle}>Response</h2>
          {statusLine && (
            <p style={{ margin: '0 0 0.5rem', color: '#c9ced8' }}>{statusLine}</p>
          )}
          <pre style={pre}>{responseText || '—'}</pre>
        </section>
      </div>
    </div>
  );
}

function parseUnixNonce(s: string): number | null {
  const n = parseInt(s.trim(), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

const layout = {
  app: { padding: '1rem 1.25rem 2rem', maxWidth: '1400px', margin: '0 auto' },
  header: { marginBottom: '1.25rem' },
  main: {
    display: 'grid',
    gridTemplateColumns: 'minmax(220px, 280px) minmax(280px, 1fr) minmax(240px, 1fr)',
    gap: '1rem',
    alignItems: 'start',
  },
  aside: {
    background: '#1a1d26',
    borderRadius: '8px',
    padding: '1rem',
    border: '1px solid #2a2f3c',
  },
  center: {
    background: '#1a1d26',
    borderRadius: '8px',
    padding: '1rem',
    border: '1px solid #2a2f3c',
    minHeight: '240px',
  },
  right: {
    background: '#1a1d26',
    borderRadius: '8px',
    padding: '1rem',
    border: '1px solid #2a2f3c',
    minHeight: '240px',
  },
} as const;

const sectionTitle: CSSProperties = {
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#8b909d',
  margin: '0 0 0.65rem',
};

const label: CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  color: '#b4bac8',
  marginBottom: '0.25rem',
};

const input: CSSProperties = {
  width: '100%',
  marginBottom: '0.65rem',
  padding: '0.45rem 0.5rem',
  borderRadius: '6px',
  border: '1px solid #3a4154',
  background: '#0e1016',
  color: '#e8e8ec',
};

const textarea: CSSProperties = {
  ...input,
  minHeight: '220px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.8rem',
  marginBottom: '0.75rem',
};

const button: CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '6px',
  border: 'none',
  background: '#3d5afe',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};

const pre: CSSProperties = {
  margin: 0,
  padding: '0.65rem',
  background: '#0e1016',
  borderRadius: '6px',
  border: '1px solid #2a2f3c',
  fontSize: '0.75rem',
  overflow: 'auto',
  maxHeight: 'min(70vh, 520px)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const block: CSSProperties = { marginBottom: '0.5rem' };

const fileInput: CSSProperties = { marginBottom: '0.65rem', color: '#b4bac8' };

const help: CSSProperties = {
  fontSize: '0.78rem',
  color: '#8f96a3',
  margin: '0 0 0.65rem',
  lineHeight: 1.45,
};

const helpAside: CSSProperties = {
  ...help,
  margin: '0 0 0.75rem',
  padding: '0.5rem 0.6rem',
  background: '#141821',
  borderRadius: '6px',
  border: '1px solid #2a3040',
};

const btnRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  marginBottom: '0.5rem',
};

const btnSecondary: CSSProperties = {
  ...button,
  background: '#2a3142',
  fontWeight: 500,
  fontSize: '0.8rem',
  padding: '0.35rem 0.65rem',
};
