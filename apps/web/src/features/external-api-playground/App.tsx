import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { ThemeToggle } from '@/components/theme-toggle';
import { externalApiUrl } from '@/lib/external-api-url';
import { emptySigningHeaders, parseUnixNonce, STATUS_OPTIONS } from './playground-helpers';
import {
  block,
  btnRow,
  btnSecondary,
  button,
  fileInput,
  help,
  helpAside,
  input,
  inputMono,
  keyGroupLabel,
  keyGroupPayin,
  keyGroupPayout,
  label,
  layout,
  pre,
  sectionTitle,
  textarea,
} from './playground-styles';
import { runJsonLoadTest } from './playground-load-test';
import { jsonBodyStorageKey, LS, loadKeys } from './playground-storage';

function fileDedupeKey(f: File): string {
  return `${f.name}:${f.size}:${f.lastModified}`;
}

/** Merge newly picked files into the list (same picker can be used repeatedly). */
function mergeUniqueFiles(existing: File[], incoming: File[]): File[] {
  const seen = new Set(existing.map(fileDedupeKey));
  const next = [...existing];
  for (const f of incoming) {
    const k = fileDedupeKey(f);
    if (!seen.has(k)) {
      seen.add(k);
      next.push(f);
    }
  }
  return next;
}

export function App() {
  const [keys, setKeys] = useState(loadKeys);
  const [endpointId, setEndpointId] = useState(() =>
    typeof window !== 'undefined'
      ? (localStorage.getItem(LS.lastEndpoint) ?? EXTERNAL_ENDPOINTS[0].id)
      : EXTERNAL_ENDPOINTS[0].id,
  );
  const [useV2, setUseV2] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(LS.useV2) === '1',
  );
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
    proofFiles: [] as File[],
    appealFiles: [] as File[],
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

  const loadTestAbortRef = useRef<AbortController | null>(null);
  const [loadTestTotal, setLoadTestTotal] = useState('50');
  const [loadTestConcurrency, setLoadTestConcurrency] = useState('50');
  const [loadTestRunning, setLoadTestRunning] = useState(false);
  const [loadTestProgress, setLoadTestProgress] = useState('');
  const [loadTestOutput, setLoadTestOutput] = useState('');

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
    const storageKey = jsonBodyStorageKey(endpoint.id);
    const stored =
      typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;

    const applyDefaults = () => {
      const nonce = Math.floor(Date.now() / 1000);
      setPreviewNonce(nonce);
      try {
        const raw = getDefaultJsonForEndpoint(endpoint);
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        let next: string;
        if (useV2Ref.current) {
          next = JSON.stringify(
            mergeJsonForSigning(parsed, endpoint.path, true, nonce),
            null,
            2,
          );
        } else {
          next = JSON.stringify(parsed, null, 2);
        }
        setBodyJson(next);
        localStorage.setItem(storageKey, next);
      } catch {
        const fallback = getDefaultJsonForEndpoint(endpoint);
        setBodyJson(fallback);
        localStorage.setItem(storageKey, fallback);
      }
    };

    if (stored != null && stored.trim() !== '') {
      setBodyJson(stored);
      try {
        const parsed = JSON.parse(stored) as Record<string, unknown>;
        const n =
          typeof parsed.nonce === 'number'
            ? parsed.nonce
            : Math.floor(Date.now() / 1000);
        setPreviewNonce(n);
      } catch {
        setPreviewNonce(Math.floor(Date.now() / 1000));
      }
      return;
    }

    applyDefaults();
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
      proofFiles: [],
      appealFiles: [],
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
        let next: string;
        if (useV2) {
          const n = Math.floor(Date.now() / 1000);
          setPreviewNonce(n);
          next = JSON.stringify(
            mergeJsonForSigning(parsed, endpoint.path, true, n),
            null,
            2,
          );
        } else {
          const { api_url: _a, ...rest } = parsed as Record<string, unknown> & {
            api_url?: unknown;
          };
          next = JSON.stringify(rest, null, 2);
        }
        if (typeof window !== 'undefined') {
          localStorage.setItem(jsonBodyStorageKey(endpoint.id), next);
        }
        return next;
      } catch {
        return prev;
      }
    });
  }, [useV2, endpoint.path, endpoint.kind, endpoint.id]);

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
    const id = endpoint.id;
    setBodyJson((prev) => {
      try {
        const parsed = JSON.parse(prev) as Record<string, unknown>;
        const withNonce = { ...parsed, nonce: n };
        let next: string;
        if (useV2) {
          next = JSON.stringify(
            mergeJsonForSigning(withNonce, endpoint.path, true, n),
            null,
            2,
          );
        } else {
          next = JSON.stringify(withNonce, null, 2);
        }
        if (typeof window !== 'undefined') {
          localStorage.setItem(jsonBodyStorageKey(id), next);
        }
        return next;
      } catch {
        return prev;
      }
    });
    setStatusLine('');
  }, [endpoint.id, endpoint.path, useV2]);

  /** Appeal/send: set nonce to a fresh `Date.now()` string (matches default). */
  const refreshAppealNonce = useCallback(() => {
    setMultipart((m) => ({ ...m, appealNonce: String(Date.now()) }));
    setStatusLine('');
  }, []);

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
      const res = await fetch(externalApiUrl(endpoint.path), {
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
      for (const f of multipart.proofFiles) {
        fd.append('files', f);
      }
      const res = await fetch(externalApiUrl(endpoint.path), {
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
      for (const f of multipart.appealFiles) {
        fd.append('files', f);
      }
      const res = await fetch(externalApiUrl(endpoint.path), {
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

  const stopLoadTest = useCallback(() => {
    loadTestAbortRef.current?.abort();
  }, []);

  const runLoadTest = useCallback(async () => {
    if (!publicKey.trim() || !secret.trim()) {
      setLoadTestOutput('Set Pay-In / Pay-Out keys for this endpoint direction.');
      return;
    }
    if (endpoint.kind !== 'json') return;

    let template: Record<string, unknown>;
    try {
      template = JSON.parse(bodyJson) as Record<string, unknown>;
    } catch {
      setLoadTestOutput('Body must be valid JSON.');
      return;
    }

    const total = Number.parseInt(loadTestTotal.trim(), 10);
    const concurrency = Number.parseInt(loadTestConcurrency.trim(), 10);

    loadTestAbortRef.current?.abort();
    const ac = new AbortController();
    loadTestAbortRef.current = ac;
    setLoadTestRunning(true);
    setLoadTestProgress('0/…');
    setLoadTestOutput('');

    try {
      const result = await runJsonLoadTest({
        fetchUrl: externalApiUrl(endpoint.path),
        signingPath: endpoint.path,
        template,
        useV2,
        publicKey,
        secret,
        total,
        concurrency,
        signal: ac.signal,
        onProgress: (done, tot) => setLoadTestProgress(`${done}/${tot}`),
      });

      if (!result.ok) {
        setLoadTestOutput(result.error);
        return;
      }

      const failSamples = result.attempts
        .filter((a) => !a.ok)
        .slice(0, 15)
        .map((a) => ({
          index: a.index,
          status: a.status,
          latencyMs: a.latencyMs,
          detail: a.bodyPreview,
        }));

      setLoadTestOutput(
        JSON.stringify(
          {
            summary: result.summary,
            failuresSample: failSamples,
          },
          null,
          2,
        ),
      );
    } finally {
      setLoadTestRunning(false);
      setLoadTestProgress('');
      if (loadTestAbortRef.current === ac) {
        loadTestAbortRef.current = null;
      }
    }
  }, [
    bodyJson,
    endpoint.kind,
    endpoint.path,
    loadTestConcurrency,
    loadTestTotal,
    publicKey,
    secret,
    useV2,
  ]);

  return (
    <div style={layout.app}>
      <header style={layout.toolbar}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, letterSpacing: '-0.02em' }}>
            External API playground
          </h1>
          <p style={{ margin: '0.2rem 0 0', color: 'var(--pg-muted)', fontSize: '0.78rem' }}>
            <code>/api/external/v1</code> · keys + JSON bodies saved in{' '}
            <code>localStorage</code> · API base{' '}
            <code>NEXT_PUBLIC_API_URL</code>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <ThemeToggle />
          <button
            type="button"
            style={{ ...button, padding: '0.55rem 1.4rem' }}
            disabled={loading || loadTestRunning}
            onClick={() => send()}
          >
            {loading ? 'Sending…' : 'Send request'}
          </button>
        </div>
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

          {endpoint.kind === 'json' && (
            <>
              <h2 style={{ ...sectionTitle, marginTop: '1.1rem' }}>Load test</h2>
              <p style={{ ...help, margin: '0 0 0.5rem' }}>
                Reuses the JSON body above. Each iteration sets a distinct <code>nonce</code> and{' '}
                <code>request_id</code> when that field exists, and suffixes{' '}
                <code>user_id</code> for Pay-In uploads. Sends real HTTPS traffic — use a staging API
                base.
              </p>
              <label style={label}>Total requests (1–500)</label>
              <input
                type="number"
                min={1}
                max={500}
                style={input}
                value={loadTestTotal}
                onChange={(e) => setLoadTestTotal(e.target.value)}
                disabled={loadTestRunning}
              />
              <label style={label}>Concurrency (1–100)</label>
              <input
                type="number"
                min={1}
                max={100}
                style={input}
                value={loadTestConcurrency}
                onChange={(e) => setLoadTestConcurrency(e.target.value)}
                disabled={loadTestRunning}
              />
              {loadTestProgress ? (
                <p style={{ ...help, margin: '0.35rem 0 0', color: '#9aa3b5' }}>{loadTestProgress}</p>
              ) : null}
              <div style={{ ...btnRow, marginTop: '0.45rem' }}>
                <button
                  type="button"
                  style={{ ...button, padding: '0.45rem 0.95rem', fontSize: '0.82rem' }}
                  disabled={loading || loadTestRunning}
                  onClick={() => void runLoadTest()}
                >
                  Run load test
                </button>
                <button
                  type="button"
                  style={btnSecondary}
                  disabled={!loadTestRunning}
                  onClick={stopLoadTest}
                >
                  Stop
                </button>
              </div>
              {loadTestOutput ? (
                <pre
                  style={{
                    ...pre,
                    marginTop: '0.55rem',
                    maxHeight: '180px',
                    fontSize: '0.68rem',
                    overflow: 'auto',
                  }}
                >
                  {loadTestOutput}
                </pre>
              ) : null}
            </>
          )}
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              flexShrink: 0,
              flexWrap: 'wrap',
            }}
          >
            <h2 style={{ ...sectionTitle, flexShrink: 0, margin: 0 }}>Request body / form</h2>
            {endpoint.kind === 'json' ? (
              <button type="button" style={btnSecondary} onClick={() => refreshPreviewNonce()}>
                Refresh nonce
              </button>
            ) : endpoint.multipart === 'appeal_send' ? (
              <button type="button" style={btnSecondary} onClick={() => refreshAppealNonce()}>
                Refresh nonce
              </button>
            ) : null}
          </div>
          {endpoint.kind === 'json' ? (
            <>
              <textarea
                style={{ ...textarea, flex: '1 1 0', minHeight: '100px', resize: 'none' as const }}
                value={bodyJson}
                onChange={(e) => {
                  const v = e.target.value;
                  setBodyJson(v);
                  if (typeof window !== 'undefined') {
                    localStorage.setItem(jsonBodyStorageKey(endpoint.id), v);
                  }
                }}
                spellCheck={false}
              />
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
                onChange={(e) => {
                  const incoming = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  setMultipart((m) => ({
                    ...m,
                    proofFiles: mergeUniqueFiles(m.proofFiles, incoming),
                  }));
                }}
              />
              {multipart.proofFiles.length > 0 && (
                <>
                  <p style={{ ...help, marginTop: '0.35rem' }}>
                    {multipart.proofFiles.length} file(s) will be sent. Use multi-select
                    (Ctrl/Cmd+click) or choose again to add more.
                  </p>
                  <ul
                    style={{
                      margin: '0.25rem 0 0.35rem',
                      paddingLeft: '1.1rem',
                      fontSize: '0.72rem',
                      lineHeight: 1.35,
                      maxHeight: '6.5rem',
                      overflow: 'auto',
                    }}
                  >
                    {multipart.proofFiles.map((f) => (
                      <li key={`${f.name}-${f.size}-${f.lastModified}`}>{f.name}</li>
                    ))}
                  </ul>
                  <div style={btnRow}>
                    <button
                      type="button"
                      style={btnSecondary}
                      onClick={() => setMultipart((m) => ({ ...m, proofFiles: [] }))}
                    >
                      Clear proof files
                    </button>
                  </div>
                </>
              )}
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
                Default is milliseconds (e.g. <code>Date.now()</code>). Use Refresh to get a new value if
                the server rejected the nonce.
              </p>
              <label style={label}>Proof files</label>
              <input
                type="file"
                multiple
                style={fileInput}
                onChange={(e) => {
                  const incoming = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  setMultipart((m) => ({
                    ...m,
                    appealFiles: mergeUniqueFiles(m.appealFiles, incoming),
                  }));
                }}
              />
              {multipart.appealFiles.length > 0 && (
                <>
                  <p style={{ ...help, marginTop: '0.35rem' }}>
                    {multipart.appealFiles.length} file(s) will be sent. Use multi-select
                    (Ctrl/Cmd+click) or choose again to add more.
                  </p>
                  <ul
                    style={{
                      margin: '0.25rem 0 0.35rem',
                      paddingLeft: '1.1rem',
                      fontSize: '0.72rem',
                      lineHeight: 1.35,
                      maxHeight: '6.5rem',
                      overflow: 'auto',
                    }}
                  >
                    {multipart.appealFiles.map((f) => (
                      <li key={`${f.name}-${f.size}-${f.lastModified}`}>{f.name}</li>
                    ))}
                  </ul>
                  <div style={btnRow}>
                    <button
                      type="button"
                      style={btnSecondary}
                      onClick={() => setMultipart((m) => ({ ...m, appealFiles: [] }))}
                    >
                      Clear appeal files
                    </button>
                  </div>
                </>
              )}
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
