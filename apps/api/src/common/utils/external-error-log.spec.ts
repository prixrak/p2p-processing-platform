import { Logger } from '@nestjs/common';
import {
  logExternalFailure,
  logHttpResponseFailure,
  summarizeExternalError,
} from './external-error-log';

describe('summarizeExternalError', () => {
  it('handles plain Error', () => {
    const err = new Error('boom');
    err.name = 'CustomErr';
    expect(summarizeExternalError(err)).toMatchObject({
      errorType: 'CustomErr',
      errorMessage: 'boom',
    });
  });

  it('handles AWS-like SDK error shape', () => {
    const err = Object.assign(new Error('Access Denied'), {
      name: 'AccessDenied',
      Code: 'AccessDenied',
      $metadata: {
        httpStatusCode: 403,
        requestId: 'REQ-1',
        extendedRequestId: 'EXT-1',
      },
    });
    expect(summarizeExternalError(err)).toMatchObject({
      errorType: 'AccessDenied',
      errorMessage: 'Access Denied',
      httpStatusCode: 403,
      awsRequestId: 'REQ-1',
      awsExtendedRequestId: 'EXT-1',
      awsErrorCode: 'AccessDenied',
    });
  });

  it('handles non-Error throws', () => {
    expect(summarizeExternalError('string fail')).toEqual({
      errorType: 'string',
      errorMessage: 'string fail',
    });
  });
});

describe('logExternalFailure', () => {
  it('invokes logger.error with structured payload', () => {
    const logger = { error: jest.fn(), warn: jest.fn() } as unknown as Logger;
    logExternalFailure(logger, {
      integration: 'TestAPI',
      operation: 'call',
      context: { foo: 1 },
      error: new Error('x'),
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [ctx] = (logger.error as jest.Mock).mock.calls[0];
    expect(ctx).toMatchObject({
      integration: 'TestAPI',
      operation: 'call',
      foo: 1,
      errorMessage: 'x',
    });
  });
});

describe('logHttpResponseFailure', () => {
  it('includes truncated body preview', () => {
    const logger = { error: jest.fn(), warn: jest.fn() } as unknown as Logger;
    logHttpResponseFailure(logger, {
      integration: 'Binance',
      operation: 'adv/search',
      status: 418,
      statusText: 'I am a teapot',
      bodyPreview: 'x'.repeat(600),
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [ctx] = (logger.warn as jest.Mock).mock.calls[0];
    expect(ctx.responseBodyPreview.length).toBeLessThanOrEqual(513);
    expect(ctx.responseBodyPreview.endsWith('…')).toBe(true);
  });
});
