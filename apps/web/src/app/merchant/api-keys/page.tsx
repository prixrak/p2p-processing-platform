'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key,
  Eye,
  EyeOff,
  Copy,
  Check,
  AlertTriangle,
  Plus,
} from 'lucide-react';
import { api } from '@/lib/api';
import { internalPaths } from '@/lib/internal-api';
import { merchantKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { useCopyToClipboard } from '@/lib/hooks/use-copy-to-clipboard';
import { ORDER_LIST_DIRECTION, type OrderListDirection } from '@p2p/shared';
import { formatDateTime } from '@/lib/utils';

interface ApiKeyPair {
  id: string;
  direction: OrderListDirection;
  publicKey: string;
  secretKeyMasked: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface NewKeyPairResponse {
  id: string;
  publicKey: string;
  secretKey: string;
}

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [regeneratingDirection, setRegeneratingDirection] = useState<string>('');
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const { copied, copy: copyToClipboardRaw } = useCopyToClipboard();

  const { data: keys = [], isLoading } = useQuery<ApiKeyPair[]>({
    queryKey: merchantKeys.apiKeys(),
    queryFn: () => api.get(internalPaths.merchantApiKeys),
  });

  const generateMutation = useMutation<NewKeyPairResponse, Error, 'PAYIN' | 'PAYOUT'>({
    mutationFn: (direction) =>
      api.post<NewKeyPairResponse>(internalPaths.merchantApiKeys, { direction }),
    onSuccess: (data) => {
      setNewSecret(data.secretKey);
      queryClient.invalidateQueries({ queryKey: merchantKeys.apiKeys() });
    },
  });

  const regenerateMutation = useMutation<NewKeyPairResponse, Error, string>({
    mutationFn: (keyId: string) =>
      api.post(internalPaths.merchantApiKeyRegenerate(keyId)),
    onSuccess: (data) => {
      setNewSecret(data.secretKey);
      setRegeneratingId(null);
      queryClient.invalidateQueries({ queryKey: merchantKeys.apiKeys() });
    },
  });

  function copyToClipboard(text: string, label: string) {
    void copyToClipboardRaw(text, label);
  }

  const payInKeys = keys.filter((k) => k.direction === ORDER_LIST_DIRECTION.PAY_IN);
  const payOutKeys = keys.filter((k) => k.direction === ORDER_LIST_DIRECTION.PAY_OUT);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Key size={24} />
          API Keys
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Manage your Pay-In and Pay-Out API key pairs
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="bg-bg-card border border-border-primary rounded-xl p-6"
            >
              <div className="h-5 w-32 bg-bg-tertiary rounded mb-4" />
              <div className="h-4 w-full bg-bg-tertiary rounded mb-2" />
              <div className="h-4 w-3/4 bg-bg-tertiary rounded" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <KeySection
            title="Pay-In Keys"
            keys={payInKeys}
            generateDirection="PAYIN"
            onGenerate={() => generateMutation.mutate('PAYIN')}
            isGenerateLoading={
              generateMutation.isPending && generateMutation.variables === 'PAYIN'
            }
            onRegenerate={(key) => {
              setRegeneratingId(key.id);
              setRegeneratingDirection(key.direction);
            }}
            onCopy={copyToClipboard}
            copied={typeof copied === 'string' ? copied : null}
          />
          <KeySection
            title="Pay-Out Keys"
            keys={payOutKeys}
            generateDirection="PAYOUT"
            onGenerate={() => generateMutation.mutate('PAYOUT')}
            isGenerateLoading={
              generateMutation.isPending && generateMutation.variables === 'PAYOUT'
            }
            onRegenerate={(key) => {
              setRegeneratingId(key.id);
              setRegeneratingDirection(key.direction);
            }}
            onCopy={copyToClipboard}
            copied={typeof copied === 'string' ? copied : null}
          />
        </>
      )}

      <Modal
        open={!!regeneratingId}
        onClose={() => setRegeneratingId(null)}
        title="Regenerate API Key"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-accent-red/10 rounded-lg">
            <AlertTriangle size={20} className="text-accent-red flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-text-primary font-medium">
                This action cannot be undone
              </p>
              <p className="text-xs text-text-muted mt-1">
                The current {regeneratingDirection.replace('_', '-')} secret key will be
                instantly invalidated. Any integrations using the old key will stop working
                immediately.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setRegeneratingId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={regenerateMutation.isPending}
              onClick={() => {
                if (regeneratingId) regenerateMutation.mutate(regeneratingId);
              }}
              icon={<Key size={14} />}
            >
              Regenerate
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!newSecret}
        onClose={() => setNewSecret(null)}
        title="New Secret Key Generated"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-accent-yellow/10 rounded-lg">
            <AlertTriangle size={20} className="text-accent-yellow flex-shrink-0 mt-0.5" />
            <p className="text-sm text-text-primary">
              Copy your secret key now. It will not be shown again.
            </p>
          </div>
          <div className="bg-bg-primary rounded-lg p-4">
            <p className="text-xs text-text-muted mb-1">Secret Key</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm text-accent-green font-mono break-all">
                {newSecret}
              </code>
              <button
                onClick={() => copyToClipboard(newSecret!, 'secret')}
                className="p-2 rounded-md hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
              >
                {copied === 'secret' ? <Check size={16} className="text-accent-green" /> : <Copy size={16} />}
              </button>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setNewSecret(null)}>Done</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function KeySection({
  title,
  keys,
  generateDirection,
  onGenerate,
  isGenerateLoading,
  onRegenerate,
  onCopy,
  copied,
}: {
  title: string;
  keys: ApiKeyPair[];
  generateDirection?: 'PAYIN' | 'PAYOUT';
  onGenerate?: () => void;
  isGenerateLoading?: boolean;
  onRegenerate: (key: ApiKeyPair) => void;
  onCopy: (text: string, label: string) => void;
  copied: string | null;
}) {
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());

  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary mb-3">{title}</h2>
      {keys.length === 0 ? (
        <div className="bg-bg-card border border-border-primary rounded-xl p-8 flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-text-muted max-w-md">
            No keys configured for this direction. Generate a key pair to authenticate
            External API requests (HMAC signing).
          </p>
          {onGenerate && generateDirection ? (
            <Button
              variant="primary"
              icon={<Plus size={14} />}
              loading={isGenerateLoading}
              onClick={onGenerate}
            >
              Generate keys
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => (
            <div
              key={key.id}
              className="bg-bg-card border border-border-primary rounded-xl p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <Badge variant="info">{key.direction.replace('_', '-')}</Badge>
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Key size={12} />}
                  onClick={() => onRegenerate(key)}
                >
                  Regenerate
                </Button>
              </div>

              <div className="space-y-2">
                <div>
                  <p className="text-xs text-text-muted mb-1">Public Key</p>
                  <div className="flex items-center gap-2 bg-bg-primary rounded-lg px-3 py-2">
                    <code className="flex-1 text-sm text-text-secondary font-mono truncate">
                      {key.publicKey}
                    </code>
                    <button
                      onClick={() => onCopy(key.publicKey, `pub-${key.id}`)}
                      className="p-1 rounded text-text-muted hover:text-text-primary"
                    >
                      {copied === `pub-${key.id}` ? (
                        <Check size={14} className="text-accent-green" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-text-muted mb-1">Secret Key</p>
                  <div className="flex items-center gap-2 bg-bg-primary rounded-lg px-3 py-2">
                    <code className="flex-1 text-sm text-text-secondary font-mono">
                      {visibleSecrets.has(key.id)
                        ? key.secretKeyMasked
                        : '••••••••••••••••••••••••'}
                    </code>
                    <button
                      onClick={() =>
                        setVisibleSecrets((prev) => {
                          const next = new Set(prev);
                          if (next.has(key.id)) next.delete(key.id);
                          else next.add(key.id);
                          return next;
                        })
                      }
                      className="p-1 rounded text-text-muted hover:text-text-primary"
                    >
                      {visibleSecrets.has(key.id) ? (
                        <EyeOff size={14} />
                      ) : (
                        <Eye size={14} />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {key.lastUsedAt && (
                <p className="text-xs text-text-muted">
                  Last used: {formatDateTime(new Date(key.lastUsedAt))}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
