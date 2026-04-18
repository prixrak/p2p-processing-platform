import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  DEFAULT_DEV_KEYS,
  DEV_KEY_PRESETS,
  findDevKeyPresetId,
} from './dev-defaults';
import {
  EXTERNAL_ENDPOINTS,
  getDefaultJsonForEndpoint,
  getDefaultMultipartFields,
} from './endpoints';
import { ExternalApiHeaders } from '@p2p/shared';
import {
  buildMultipartAuthHeaders,
  buildSignedJsonRequest,
  mergeJsonForSigning,
  utf8FromBase64,
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

const emptySigningHeaders = () => ({
  [ExternalApiHeaders.API_KEY]: '',
  [ExternalApiHeaders.API_PAYLOAD]: '',
  [ExternalApiHeaders.API_SIGNATURE]: '',
});

function parseUnixNonce(s: string): number | null {
  const n = parseInt(s.trim(), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function App() {
  const [keys, setKeys] = useState(loadKeys);
  const [endpointId, setEndpointId] = useState(
    () => localStorage.getItem(LS.lastEndpoint) ?? EXTERNAL_ENDPOINTS[0].id,
  );
  const [useV2, setUseV2] = useState(() => localStorage.getItem(LS.useV2) === '1');
  const useV2Ref = useRef(useV2);
  useV2Ref.current = useV2;
  const prevUseV2ForToggle = useRef<boolean | undefined>(undefined);
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

  const [signingHeaders, setSigningHeaders] = useState(emptySigningHeaders);
  const [lockSigningHeaders, setLockSigningHeaders] = useState(false);
  const [signingHeadersError, setSigningHeadersError] = useState<string | null>(null);

  const endpoint = useMemo(
    () => EXTERNAL_ENDPOINTS.find((e) => e.id === endpointId) ?? EXTERNAL_ENDPOINTS[0],
    [endpointId],
  );

  const payinEndpoints = useMemo(
    () => EXTERNAL_ENDPOINTS.filter((e) => e.direction === 'payin'),
    [],
  );
  const payoutEndpoints = useMemo(
    () => EXTERNAL_ENDPOINTS.filter((e) => e.direction === 'payout'),
    [],
  );

  const activeKeyPresetId = useMemo(
    () => findDevKeyPresetId(keys) ?? '__custom__',
    [keys],
  );

  const applyKeyPreset = useCallback((id: string) => {
    if (id === '__custom__') return;
    const preset = DEV_KEY_PRESETS.find((p) => p.id === id);
    if (preset) setKeys({ ...preset.keys });
  }, []);

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
    if (endpoint.kind !== 'json') return;
    const nonce = Math.floor(Date.now() / 1000);
    setPreviewNonce(nonce);
    try {
      const raw = getDefaultJsonForEndpoint(endpoint);
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (useV2Ref.current) {
        setBodyJson(
          JSON.stringify(mergeJsonForSigning(parsed, endpoint.path, true, nonce), null, 2),
        );
      } else {
        setBodyJson(JSON.stringify(parsed, null, 2));
      }
    } catch {
      setBodyJson(getDefaultJsonForEndpoint(endpoint));
    }
  }, [endpoint.id, endpoint.kind, endpoint.path]);

  useEffect(() => {
    if (endpoint.kind !== 'multipart') return;
    const d = getDefaultMultipartFields(endpoint);
    if (!d) return;
    setMultipart({
      status: d.status ?? 'VERIFIED',
      proofId: d.proofId ?? '',
      proofNonce: d.proofNonce ?? String(Math.floor(Date.now() / 1000)),
      appealOrderId: d.appealOrderId ?? '',
      appealPaidAmount: d.appealPaidAmount ?? '100',
      appealNonce: d.appealNonce ?? String(Date.now()),
      proofFiles: null,
      appealFiles: null,
    });
  }, [endpoint.id, endpoint.kind, endpoint.multipart]);

  useEffect(() => {
    if (endpoint.kind !== 'json') return;
    if (prevUseV2ForToggle.current === undefined) {
      prevUseV2ForToggle.current = useV2;
      return;
    }
    if (prevUseV2ForToggle.current === useV2) return;
    prevUseV2ForToggle.current = useV2;
    setBodyJson((prev) => {
      try {
        const parsed = JSON.parse(prev) as Record<string, unknown>;
        if (useV2) {
          const n = Math.floor(Date.now() / 1000);
          setPreviewNonce(n);
          return JSON.stringify(
            mergeJsonForSigning(parsed, endpoint.path, true, n),
            null,
            2,
          );
        }
        const { api_url: _a, ...rest } = parsed as Record<string, unknown> & {
          api_url?: unknown;
        };
        return JSON.stringify(rest, null, 2);
      } catch {
        return prev;
      }
    });
  }, [useV2, endpoint.path, endpoint.kind]);

  const jsonPreviewMerged = useMemo(() => {
    if (endpoint.kind !== 'json') return null;
    try {
      const parsed = JSON.parse(bodyJson) as Record<string, unknown>;
      return mergeJsonForSigning(parsed, endpoint.path, useV2, previewNonce);
    } catch {
      return null;
    }
  }, [bodyJson, endpoint.kind, endpoint.path, useV2, previewNonce]);

  const refreshPreviewNonce = useCallback(() => {
    const n = Math.floor(Date.now() / 1000);
    setPreviewNonce(n);
    setBodyJson((prev) => {
      try {
        const parsed = JSON.parse(prev) as Record<string, unknown>;
        const withNonce = { ...parsed, nonce: n };
        if (useV2) {
          return JSON.stringify(
            mergeJsonForSigning(withNonce, endpoint.path, true, n),
            null,
            2,
          );
        }
        return JSON.stringify(withNonce, null, 2);
      } catch {
        return prev;
      }
    });
    setStatusLine('');
  }, [endpoint.path, useV2]);

  const publicKey = endpoint.direction === 'payin' ? keys.payinPublicKey : keys.payoutPublicKey;
  const secret = endpoint.direction === 'payin' ? keys.payinSecret : keys.payoutSecret;

  const syncSigningHeadersNow = useCallback(async () => {
    if (!publicKey.trim() || !secret.trim()) {
      setSigningHeadersError('Set signing keys for this direction');
      return;
    }
    if (endpoint.kind === 'json') {
      try {
        const parsed = JSON.parse(bodyJson) as Record<string, unknown>;
        const { headers } = await buildSignedJsonRequest({
          publicKey,
          secret,
          body: parsed,
          apiUrl: endpoint.path,
          useV2,
        });
        setSigningHeaders({
          [ExternalApiHeaders.API_KEY]: headers[ExternalApiHeaders.API_KEY],
          [ExternalApiHeaders.API_PAYLOAD]: headers[ExternalApiHeaders.API_PAYLOAD],
          [ExternalApiHeaders.API_SIGNATURE]: headers[ExternalApiHeaders.API_SIGNATURE],
        });
        setSigningHeadersError(null);
      } catch {
        setSigningHeadersError('Invalid JSON or signing failed');
      }
      return;
    }
    if (endpoint.multipart === 'update_order_with_proofs') {
      const nonce = parseUnixNonce(multipart.proofNonce);
      if (nonce === null) {
        setSigningHeadersError('Invalid nonce (Unix seconds)');
        return;
      }
      const formula = `id=${multipart.proofId};status=${multipart.status};nonce=${nonce}`;
      const { headers } = await buildMultipartAuthHeaders({
        publicKey,
        secret,
        formula,
      });
      setSigningHeaders({
        [ExternalApiHeaders.API_KEY]: headers[ExternalApiHeaders.API_KEY],
        [ExternalApiHeaders.API_PAYLOAD]: headers[ExternalApiHeaders.API_PAYLOAD],
        [ExternalApiHeaders.API_SIGNATURE]: headers[ExternalApiHeaders.API_SIGNATURE],
      });
      setSigningHeadersError(null);
      return;
    }
    if (endpoint.multipart === 'appeal_send') {
      const paid = Number(multipart.appealPaidAmount);
      if (!multipart.appealOrderId || !Number.isFinite(paid) || paid <= 0) {
        setSigningHeadersError('Fill order_id and paid_amount');
        return;
      }
      const nonceNum = Number(multipart.appealNonce);
      if (!Number.isFinite(nonceNum)) {
        setSigningHeadersError('Invalid appeal nonce');
        return;
      }
      const formula = `order_id=${multipart.appealOrderId};paid_amount=${paid};nonce=${nonceNum}`;
      const { headers } = await buildMultipartAuthHeaders({
        publicKey,
        secret,
        formula,
      });
      setSigningHeaders({
        [ExternalApiHeaders.API_KEY]: headers[ExternalApiHeaders.API_KEY],
        [ExternalApiHeaders.API_PAYLOAD]: headers[ExternalApiHeaders.API_PAYLOAD],
        [ExternalApiHeaders.API_SIGNATURE]: headers[ExternalApiHeaders.API_SIGNATURE],
      });
      setSigningHeadersError(null);
    }
  }, [
    bodyJson,
    endpoint.kind,
    endpoint.multipart,
    endpoint.path,
    multipart,
    publicKey,
    secret,
    useV2,
  ]);

  useEffect(() => {
    setLockSigningHeaders(false);
  }, [endpoint.id]);

  const keysSignature = `${endpoint.direction}:${publicKey}:${secret}`;
  const prevKeysSignatureRef = useRef<string>('');

  useEffect(() => {
    const keysChanged = prevKeysSignatureRef.current !== keysSignature;
    prevKeysSignatureRef.current = keysSignature;
    if (lockSigningHeaders && !keysChanged) return;
    void syncSigningHeadersNow();
  }, [keysSignature, lockSigningHeaders, syncSigningHeadersNow]);

  const sendJson = useCallback(async () => {
    const pk = signingHeaders[ExternalApiHeaders.API_KEY].trim();
    const payloadB64 = signingHeaders[ExternalApiHeaders.API_PAYLOAD].trim();
    const sig = signingHeaders[ExternalApiHeaders.API_SIGNATURE].trim();
    if (!pk || !payloadB64 || !sig) {
      setStatusLine('Fill all signing headers or click Sync signing headers');
      setResponseText('');
      return;
    }

    let bodyString: string;
    try {
      bodyString = utf8FromBase64(payloadB64);
    } catch {
      setStatusLine('Invalid X-API-PAYLOAD (not valid base64)');
      setResponseText('');
      return;
    }

    setLoading(true);
    setStatusLine('');
    setResponseText('');
    try {
      const res = await fetch(endpoint.path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [ExternalApiHeaders.API_KEY]: pk,
          [ExternalApiHeaders.API_PAYLOAD]: payloadB64,
          [ExternalApiHeaders.API_SIGNATURE]: sig,
        },
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
  }, [endpoint.path, signingHeaders]);

  const sendMultipartProofs = useCallback(async () => {
    const nonce = parseUnixNonce(multipart.proofNonce);
    if (nonce === null) {
      setStatusLine('Invalid nonce (use Unix seconds)');
      return;
    }
    const pk = signingHeaders[ExternalApiHeaders.API_KEY].trim();
    const payloadB64 = signingHeaders[ExternalApiHeaders.API_PAYLOAD].trim();
    const sig = signingHeaders[ExternalApiHeaders.API_SIGNATURE].trim();
    if (!pk || !payloadB64 || !sig) {
      setStatusLine('Fill all signing headers or click Sync signing headers');
      return;
    }
    setLoading(true);
    setStatusLine('');
    setResponseText('');
    try {
      const fd = new FormData();
      fd.append('id', multipart.proofId);
      fd.append('status', multipart.status);
      if (multipart.proofFiles) {
        for (let i = 0; i < multipart.proofFiles.length; i++) {
          fd.append('files', multipart.proofFiles[i]);
        }
      }
      const res = await fetch(endpoint.path, {
        method: 'POST',
        headers: {
          [ExternalApiHeaders.API_KEY]: pk,
          [ExternalApiHeaders.API_PAYLOAD]: payloadB64,
          [ExternalApiHeaders.API_SIGNATURE]: sig,
        },
        body: fd,
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
  }, [
    endpoint.path,
    multipart.proofFiles,
    multipart.proofId,
    multipart.proofNonce,
    multipart.status,
    signingHeaders,
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
    const pk = signingHeaders[ExternalApiHeaders.API_KEY].trim();
    const payloadB64 = signingHeaders[ExternalApiHeaders.API_PAYLOAD].trim();
    const sig = signingHeaders[ExternalApiHeaders.API_SIGNATURE].trim();
    if (!pk || !payloadB64 || !sig) {
      setStatusLine('Fill all signing headers or click Sync signing headers');
      return;
    }
    setLoading(true);
    setStatusLine('');
    setResponseText('');
    try {
      const fd = new FormData();
      fd.append('order_id', multipart.appealOrderId);
      fd.append('paid_amount', String(paid));
      fd.append('nonce', String(nonceNum));
      if (multipart.appealFiles) {
        for (let i = 0; i < multipart.appealFiles.length; i++) {
          fd.append('files', multipart.appealFiles[i]);
        }
      }
      const res = await fetch(endpoint.path, {
        method: 'POST',
        headers: {
          [ExternalApiHeaders.API_KEY]: pk,
          [ExternalApiHeaders.API_PAYLOAD]: payloadB64,
          [ExternalApiHeaders.API_SIGNATURE]: sig,
        },
        body: fd,
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
  }, [
    endpoint.path,
    multipart.appealFiles,
    multipart.appealOrderId,
    multipart.appealPaidAmount,
    multipart.appealNonce,
    signingHeaders,
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
      <header style={layout.toolbar}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, letterSpacing: '-0.02em' }}>
            External API playground
          </h1>
          <p style={{ margin: '0.2rem 0 0', color: '#8e95a3', fontSize: '0.78rem' }}>
            <code>/api/external/v1</code> · keys in <code>localStorage</code> · proxy{' '}
            <code>EXTERNAL_PLAYGROUND_API_TARGET</code>
          </p>
        </div>
        <button
          type="button"
          style={{ ...button, padding: '0.55rem 1.4rem', flexShrink: 0 }}
          disabled={loading}
          onClick={() => send()}
        >
          {loading ? 'Sending…' : 'Send request'}
        </button>
      </header>

      <div className="pg-main">
        <aside className="pg-panel pg-scroll" style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 style={sectionTitle}>API keys</h2>
          <label style={{ ...label, marginTop: 0 }}>Key pair preset</label>
          <select
            style={input}
            value={activeKeyPresetId}
            onChange={(e) => applyKeyPreset(e.target.value)}
          >
            {activeKeyPresetId === '__custom__' && (
              <option value="__custom__">Custom (manual edit)</option>
            )}
            {DEV_KEY_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <p style={{ ...help, margin: '0 0 0.65rem' }}>
            Applies Pay-In and Pay-Out keys together. You can still edit the fields below.
          </p>
          <div style={keyGroupPayin}>
            <div style={keyGroupLabel}>Pay-In</div>
            <label style={label}>Public (pk_payin_…)</label>
            <input
              style={inputMono}
              value={keys.payinPublicKey}
              onChange={(e) => setKeys((k) => ({ ...k, payinPublicKey: e.target.value }))}
              autoComplete="off"
              spellCheck={false}
            />
            <label style={label}>Secret (sk_payin_…)</label>
            <input
              style={inputMono}
              type="text"
              value={keys.payinSecret}
              onChange={(e) => setKeys((k) => ({ ...k, payinSecret: e.target.value }))}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div style={keyGroupPayout}>
            <div style={keyGroupLabel}>Pay-Out</div>
            <label style={label}>Public (pk_payout_…)</label>
            <input
              style={inputMono}
              value={keys.payoutPublicKey}
              onChange={(e) => setKeys((k) => ({ ...k, payoutPublicKey: e.target.value }))}
              autoComplete="off"
              spellCheck={false}
            />
            <label style={label}>Secret (sk_payout_…)</label>
            <input
              style={inputMono}
              type="text"
              value={keys.payoutSecret}
              onChange={(e) => setKeys((k) => ({ ...k, payoutSecret: e.target.value }))}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <h2 style={{ ...sectionTitle, marginTop: '1.1rem' }}>Endpoint</h2>
          <select
            style={input}
            value={endpointId}
            onChange={(e) => setEndpointId(e.target.value)}
          >
            <optgroup label="Pay-In">
              {payinEndpoints.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Pay-Out">
              {payoutEndpoints.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </optgroup>
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
                  marginTop: '0.75rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={useV2}
                  onChange={(e) => setUseV2(e.target.checked)}
                  style={{ marginTop: '0.2rem' }}
                />
                <span>
                  HMAC v2 — <code>api_url</code> + <code>nonce</code>
                </span>
              </label>
              <p style={helpAside}>
                Puts <code>api_url</code> and <code>nonce</code> in the JSON; turn off to strip{' '}
                <code>api_url</code>.
              </p>
            </>
          )}

          <div
            style={{
              marginTop: '0.85rem',
              padding: '0.5rem 0.6rem',
              borderRadius: '6px',
              background: endpoint.direction === 'payin' ? '#1e2436' : '#2a2520',
              border: `1px solid ${endpoint.direction === 'payin' ? '#2d3a5c' : '#4a3d2a'}`,
              fontSize: '0.78rem',
              color: '#b4bac8',
            }}
          >
            <strong style={{ color: '#e0e4ec' }}>
              Active signing: {endpoint.direction === 'payin' ? 'Pay-In' : 'Pay-Out'}
            </strong>
            <div style={{ marginTop: '0.35rem', wordBreak: 'break-all' }}>
              <code style={{ fontSize: '0.7rem' }}>{endpoint.path}</code>
            </div>
          </div>
        </aside>

        <section
          className="pg-panel"
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
            gap: '0.5rem',
          }}
        >
          <h2 style={{ ...sectionTitle, flexShrink: 0 }}>Request body / form</h2>
          {endpoint.kind === 'json' ? (
            <>
              <textarea
                style={{ ...textarea, flex: '1 1 0', minHeight: '100px', resize: 'none' as const }}
                value={bodyJson}
                onChange={(e) => setBodyJson(e.target.value)}
                spellCheck={false}
              />
              <div style={btnRow}>
                <button type="button" style={btnSecondary} onClick={() => refreshPreviewNonce()}>
                  Refresh nonce
                </button>
              </div>
              {bodyJson.trim() && jsonPreviewMerged === null && (
                <p style={{ ...help, color: '#f88', margin: 0 }}>Invalid JSON</p>
              )}
              {jsonPreviewMerged !== null && useV2 && (
                <details style={{ margin: 0, flexShrink: 0 }}>
                  <summary style={{ cursor: 'pointer', color: '#b4bac8', fontSize: '0.75rem' }}>
                    Parsed for signing
                  </summary>
                  <pre style={{ ...pre, marginTop: '0.35rem', maxHeight: '80px', fontSize: '0.7rem' }}>
                    {JSON.stringify(jsonPreviewMerged, null, 2)}
                  </pre>
                </details>
              )}
            </>
          ) : endpoint.multipart === 'update_order_with_proofs' ? (
            <div className="pg-scroll" style={{ flex: '1 1 0', minHeight: 0 }}>
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
            </div>
          ) : (
            <div className="pg-scroll" style={{ flex: '1 1 0', minHeight: 0 }}>
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
            </div>
          )}
        </section>

        <div className="pg-right-stack">
          <div
            className="pg-panel pg-signing-panel"
            style={{
              flex: '0 0 auto',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'visible',
              padding: '0.75rem 0.95rem',
            }}
          >
            <h2 style={{ ...sectionTitle, flexShrink: 0, marginBottom: '0.45rem' }}>Signing headers</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <p style={{ ...help, margin: 0, fontSize: '0.74rem', lineHeight: 1.35 }}>
                Auto-sync; <strong>key change re-signs</strong>. Lock = no body sync.
              </p>
              <label style={{ ...label, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 0 }}>
                <input
                  type="checkbox"
                  checked={lockSigningHeaders}
                  onChange={(e) => setLockSigningHeaders(e.target.checked)}
                />
                Lock body/form
              </label>
              <button
                type="button"
                style={{ ...btnSecondary, alignSelf: 'flex-start' }}
                onClick={() => void syncSigningHeadersNow()}
              >
                Sync from body / form
              </button>
              {signingHeadersError && (
                <p style={{ ...help, color: '#f88', margin: 0 }}>{signingHeadersError}</p>
              )}
              <label style={label}>{ExternalApiHeaders.API_KEY}</label>
              <input
                style={inputMono}
                value={signingHeaders[ExternalApiHeaders.API_KEY]}
                onChange={(e) =>
                  setSigningHeaders((h) => ({
                    ...h,
                    [ExternalApiHeaders.API_KEY]: e.target.value,
                  }))
                }
                spellCheck={false}
              />
              <label style={label}>{ExternalApiHeaders.API_PAYLOAD}</label>
              <textarea
                style={{
                  ...textarea,
                  minHeight: '52px',
                  maxHeight: '100px',
                  flex: '0 0 auto',
                  marginBottom: '0.25rem',
                  fontSize: '0.7rem',
                }}
                value={signingHeaders[ExternalApiHeaders.API_PAYLOAD]}
                onChange={(e) =>
                  setSigningHeaders((h) => ({
                    ...h,
                    [ExternalApiHeaders.API_PAYLOAD]: e.target.value,
                  }))
                }
                spellCheck={false}
              />
              <label style={label}>{ExternalApiHeaders.API_SIGNATURE}</label>
              <input
                style={inputMono}
                value={signingHeaders[ExternalApiHeaders.API_SIGNATURE]}
                onChange={(e) =>
                  setSigningHeaders((h) => ({
                    ...h,
                    [ExternalApiHeaders.API_SIGNATURE]: e.target.value,
                  }))
                }
                spellCheck={false}
              />
            </div>
          </div>

          <div
            className="pg-panel"
            style={{
              flex: '1 1 0',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <h2 style={{ ...sectionTitle, flexShrink: 0 }}>Response</h2>
            {statusLine && (
              <p style={{ margin: '0 0 0.35rem', color: '#a8b0c0', fontSize: '0.8rem', flexShrink: 0 }}>
                {statusLine}
              </p>
            )}
            <pre
              style={{
                ...pre,
                flex: '1 1 0',
                minHeight: 0,
                maxHeight: 'none',
                overflow: 'auto',
              }}
            >
              {responseText || '—'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

const layout = {
  app: {
    height: '100%',
    width: '100%',
    maxWidth: '1480px',
    margin: '0 auto',
    padding: '0.65rem 1rem 0.75rem',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minHeight: 0,
    boxSizing: 'border-box',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '1rem',
    flexShrink: 0,
    marginBottom: '0.65rem',
  },
} as const;

const keyGroupPayin: CSSProperties = {
  padding: '0.65rem 0.75rem',
  marginBottom: '0.85rem',
  borderRadius: '8px',
  border: '1px solid #2d3f6e',
  borderLeftWidth: '4px',
  borderLeftColor: '#5c7cfa',
  background: '#151a24',
};

const keyGroupPayout: CSSProperties = {
  padding: '0.65rem 0.75rem',
  marginBottom: '0.5rem',
  borderRadius: '8px',
  border: '1px solid #5c4a2a',
  borderLeftWidth: '4px',
  borderLeftColor: '#d4a24c',
  background: '#181612',
};

const keyGroupLabel: CSSProperties = {
  fontSize: '0.68rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#8b909d',
  marginBottom: '0.5rem',
  fontWeight: 600,
};

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

const inputMono: CSSProperties = {
  ...input,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.75rem',
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
