import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Logger } from '@nestjs/common';
import { mergeRuntimeEnvFromObject } from '@p2p/config';

const logger = new Logger('AwsSecretsManager');

function secretLookupInput(): { secretId: string } | null {
  const arn = process.env.AWS_SECRETS_MANAGER_SECRET_ARN?.trim();
  const id = process.env.AWS_SECRETS_MANAGER_SECRET_ID?.trim();
  if (arn) return { secretId: arn };
  if (id) return { secretId: id };
  return null;
}

function parseSecretString(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Secret must be a JSON object with string values');
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid AWS secret JSON: ${msg}`);
  }
}

/**
 * Fetches the configured secret once and merges into {@link mergeRuntimeEnvFromObject}.
 * When `options.silent`, skips the key-count log (periodic refresh).
 */
export async function hydrateFromAwsSecretsManager(options?: {
  silent?: boolean;
}): Promise<void> {
  const lookup = secretLookupInput();
  if (!lookup) {
    return;
  }

  const region = process.env.AWS_REGION?.trim();
  if (!region) {
    throw new Error('AWS_REGION is required when AWS_SECRETS_MANAGER_SECRET_ID/ARN is set');
  }

  const client = new SecretsManagerClient({ region });
  const out = await client.send(new GetSecretValueCommand({ SecretId: lookup.secretId }));
  const raw = out.SecretString;
  if (!raw) {
    throw new Error('AWS Secrets Manager returned an empty SecretString');
  }

  const flat = parseSecretString(raw);
  mergeRuntimeEnvFromObject(flat);
  if (!options?.silent) {
    logger.log(`Loaded ${Object.keys(flat).length} keys from AWS Secrets Manager`);
  }
}

/** Background refresh so runtime config tracks secret rotations without redeploy. */
export function startAwsSecretsRefreshLoop(): void {
  const lookup = secretLookupInput();
  if (!lookup) {
    return;
  }

  const msRaw = process.env.AWS_SECRETS_MANAGER_POLL_MS?.trim();
  let pollEvery = 300_000;

  if (msRaw !== undefined && msRaw !== '') {
    const n = parseInt(msRaw, 10);
    if (n === 0) {
      logger.log('AWS_SECRETS_MANAGER_POLL_MS=0 — skipping periodic refresh (initial load only)');
      return;
    }
    if (Number.isFinite(n) && n >= 60_000) {
      pollEvery = n;
    } else {
      logger.warn(
        'AWS_SECRETS_MANAGER_POLL_MS must be >= 60000 ms or 0; using default 300000',
      );
    }
  }

  setInterval(() => {
    void (async () => {
      try {
        await hydrateFromAwsSecretsManager({ silent: true });
        logger.debug('AWS Secrets Manager config refreshed');
      } catch (e) {
        logger.warn(
          `AWS Secrets Manager refresh failed (keeping previous values): ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    })();
  }, pollEvery);

  logger.log(`AWS Secrets Manager refresh every ${pollEvery} ms`);
}
