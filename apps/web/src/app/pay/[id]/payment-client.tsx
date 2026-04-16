'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Copy,
  Check,
  CreditCard,
  Building2,
  User,
  Banknote,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ImagePlus,
  ChevronRight,
} from 'lucide-react';
import type { OrderDto } from '@p2p/shared';
import { PayInOrderStatus } from '@p2p/shared';
import { CountdownTimer } from '@/components/ui/countdown-timer';
import { FileUpload } from '@/components/ui/file-upload';
import { confirmPayment, api } from '@/lib/api';
import { formatErrorMessage } from '@/lib/format-error';

type Step = 'viewing' | 'uploading' | 'confirming' | 'success' | 'error' | 'expired';

function isSafeRedirectUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

interface PaymentClientProps {
  order: OrderDto;
}

export function PaymentClient({ order }: PaymentClientProps) {
  const [step, setStep] = useState<Step>(() => {
    if (order.status === PayInOrderStatus.VERIFIED || order.status === PayInOrderStatus.PAID) return 'success';
    if (order.status === PayInOrderStatus.CANCELED) return 'expired';
    return 'viewing';
  });

  const [files, setFiles] = useState<File[]>([]);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);

  const [currentOrder, setCurrentOrder] = useState(order);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    if (step === 'success' || step === 'expired') return;

    pollRef.current = setInterval(async () => {
      try {
        const fresh = await api.get<OrderDto>(`/api/pay/${order.id}`);
        setCurrentOrder(fresh);
        if (fresh.status === PayInOrderStatus.CANCELED) setStep('expired');
        if (fresh.status === PayInOrderStatus.PAID || fresh.status === PayInOrderStatus.VERIFIED) {
          setStep('success');
        }
      } catch {
        // Network error -- skip this cycle
      }
    }, 5000);

    return () => clearInterval(pollRef.current);
  }, [order.id, step]);

  const cardNumber = currentOrder.payment_detail?.number ?? currentOrder.requisite_number;
  const ownerName = currentOrder.payment_detail?.owner ?? currentOrder.requisite_owner;
  const bankName = currentOrder.payment_detail?.bank_name ?? currentOrder.bank;
  const bankCode = currentOrder.payment_detail?.code;
  const currencyCode = (currentOrder.currency ?? '').trim() || 'UAH';

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable in some contexts */
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    setStep('confirming');
    setErrorMessage(null);

    try {
      await confirmPayment(order.id, files.length > 0 ? files : undefined);
      setStep('success');

      if (isSafeRedirectUrl(order.redirect_url)) {
        let count = 5;
        setRedirectCountdown(count);
        const interval = setInterval(() => {
          count -= 1;
          setRedirectCountdown(count);
          if (count <= 0) {
            clearInterval(interval);
            window.location.href = order.redirect_url!;
          }
        }, 1000);
      }
    } catch (err) {
      setStep('error');
      setErrorMessage(formatErrorMessage(err));
    }
  }, [order.id, order.redirect_url, files]);

  const handleTimerExpire = useCallback(() => {
    /* Timer is visual-only per spec — don't auto-cancel */
  }, []);

  if (step === 'success') {
    return (
      <div className="rounded-2xl border border-success/20 bg-surface-secondary p-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-muted">
          <CheckCircle2 className="h-7 w-7 text-success" />
        </div>
        <h2 className="text-lg font-semibold text-text-primary">Payment confirmed</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Your payment is being processed. Thank you!
        </p>

        {isSafeRedirectUrl(order.redirect_url) && redirectCountdown !== null && (
          <div className="mt-6">
            <p className="text-xs text-text-muted">
              Redirecting in {redirectCountdown}s…
            </p>
            <a
              href={order.redirect_url}
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
            >
              Go now
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </div>
    );
  }

  if (step === 'expired') {
    return (
      <div className="rounded-2xl border border-border-primary bg-surface-secondary p-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger-muted">
          <AlertCircle className="h-7 w-7 text-danger" />
        </div>
        <h2 className="text-lg font-semibold text-text-primary">Payment cancelled</h2>
        <p className="mt-2 text-sm text-text-secondary">
          This payment has been cancelled. Contact the merchant for a new link.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Amount card */}
      <div className="rounded-2xl border border-accent/20 bg-gradient-to-b from-accent/[0.06] to-transparent p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">Amount to pay</span>
          {currentOrder.autoclose_at && (
            <CountdownTimer targetTimestamp={currentOrder.autoclose_at} onExpire={handleTimerExpire} />
          )}
        </div>
        <p className="mt-2 text-3xl font-bold tracking-tight text-text-primary">
          {currentOrder.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          <span className="ml-2 text-lg font-medium text-text-secondary">{currencyCode}</span>
        </p>
      </div>

      {/* Requisites card */}
      <div className="overflow-hidden rounded-2xl border border-border-primary bg-surface-secondary">
        <div className="border-b border-border-primary px-5 py-3">
          <h2 className="text-sm font-medium text-text-secondary">Payment details</h2>
        </div>

        <div className="divide-y divide-border-primary">
          {/* Card / IBAN number with copy */}
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-muted">
              <CreditCard className="h-4 w-4 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-text-muted">
                {order.payment_detail?.type === 'IBAN' ? 'IBAN' : 'Card number'}
              </p>
              <p className="mt-0.5 font-mono text-sm font-semibold tracking-wider text-text-primary">
                {formatCardNumber(cardNumber)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(cardNumber)}
              className={`
                flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all duration-200
                ${copied
                  ? 'bg-success-muted text-success'
                  : 'bg-surface-tertiary text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
                }
              `}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>

          {/* Owner */}
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-tertiary">
              <User className="h-4 w-4 text-text-secondary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-text-muted">Recipient</p>
              <p className="mt-0.5 text-sm font-medium text-text-primary">{ownerName}</p>
            </div>
          </div>

          {/* Bank */}
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-tertiary">
              <Building2 className="h-4 w-4 text-text-secondary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-text-muted">Bank</p>
              <p className="mt-0.5 text-sm font-medium text-text-primary">
                {bankName}
                {bankCode && (
                  <span className="ml-1.5 text-xs text-text-muted">({bankCode})</span>
                )}
              </p>
            </div>
          </div>

          {/* Amount row */}
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-tertiary">
              <Banknote className="h-4 w-4 text-text-secondary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-text-muted">Exact amount</p>
              <p className="mt-0.5 text-sm font-semibold text-text-primary">
                {currentOrder.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                {currencyCode}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Proof upload section — toggled */}
      {step === 'viewing' && (
        <button
          type="button"
          onClick={() => setStep('uploading')}
          className="flex w-full items-center justify-between rounded-2xl border border-border-primary bg-surface-secondary px-5 py-4 text-left transition-colors hover:border-border-secondary hover:bg-surface-tertiary"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-muted">
              <ImagePlus className="h-4 w-4 text-accent" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">Attach proof of payment</p>
              <p className="text-xs text-text-muted">Optional — screenshot or receipt</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-text-muted" />
        </button>
      )}

      {step === 'uploading' && (
        <div className="rounded-2xl border border-border-primary bg-surface-secondary p-5">
          <h3 className="mb-3 text-sm font-medium text-text-primary">
            Proof of payment
          </h3>
          <FileUpload onChange={setFiles} />
        </div>
      )}

      {/* Error banner */}
      {step === 'error' && errorMessage && (
        <div className="flex items-start gap-2.5 rounded-xl bg-danger-muted px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div>
            <p className="text-sm font-medium text-danger">Could not record your confirmation</p>
            <p className="mt-0.5 text-xs text-danger/70">{errorMessage}</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border-primary bg-surface-tertiary/40 px-4 py-3 text-xs leading-relaxed text-text-secondary">
        <span className="font-medium text-text-primary">Payer:</span> transfer the exact amount first, then tap
        below so the merchant knows you sent the payment. The trader confirms when they see the funds on
        their side.
      </div>

      {/* Confirm button */}
      <button
        type="button"
        onClick={handleConfirm}
        disabled={step === 'confirming'}
        className={`
          relative flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-semibold
          transition-all duration-200
          ${step === 'confirming'
            ? 'cursor-not-allowed bg-accent/60 text-white/70'
            : 'bg-accent text-white shadow-lg shadow-accent/20 hover:bg-accent-hover hover:shadow-accent/30 active:scale-[0.98]'
          }
        `}
      >
        {step === 'confirming' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Confirming…
          </>
        ) : (
          <>
            <Check className="h-4 w-4" />
            I&apos;ve sent the payment
          </>
        )}
      </button>

      {step === 'error' && (
        <button
          type="button"
          onClick={() => setStep(files.length > 0 ? 'uploading' : 'viewing')}
          className="w-full rounded-xl border border-border-primary bg-surface-secondary py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
        >
          Go back
        </button>
      )}
    </div>
  );
}

function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\s/g, '');
  if (digits.length <= 4) return digits;
  if (digits.length > 19) return raw; // IBAN — show as-is
  return digits.match(/.{1,4}/g)?.join(' ') ?? raw;
}
