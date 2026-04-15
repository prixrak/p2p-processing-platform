import { validateCallbackUrl } from './url-validator';
import { resolve } from 'dns/promises';

jest.mock('dns/promises', () => ({
  resolve: jest.fn(),
}));

const mockedResolve = resolve as jest.MockedFunction<typeof resolve>;

describe('validateCallbackUrl', () => {
  beforeEach(() => {
    mockedResolve.mockReset();
    mockedResolve.mockResolvedValue(['8.8.8.8']);
  });

  it('accepts https URL when hostname resolves to a public IP', async () => {
    await expect(validateCallbackUrl('https://example.com/webhook')).resolves.toBeUndefined();
    expect(mockedResolve).toHaveBeenCalled();
  });

  it('rejects invalid URL string', async () => {
    await expect(validateCallbackUrl('not a url')).rejects.toMatchObject({
      response: expect.objectContaining({ statusCode: 400 }),
    });
  });

  it('rejects non-http(s) protocols', async () => {
    await expect(validateCallbackUrl('ftp://example.com/hook')).rejects.toMatchObject({
      response: expect.objectContaining({ statusCode: 400 }),
    });
  });

  it('rejects localhost hostname', async () => {
    await expect(validateCallbackUrl('https://localhost/cb')).rejects.toMatchObject({
      response: expect.objectContaining({ statusCode: 400 }),
    });
    expect(mockedResolve).not.toHaveBeenCalled();
  });

  it('rejects literal private IPv4', async () => {
    await expect(validateCallbackUrl('http://192.168.1.1/x')).rejects.toMatchObject({
      response: expect.objectContaining({ statusCode: 400 }),
    });
  });

  it('rejects hostname that resolves to a private IP', async () => {
    mockedResolve.mockResolvedValueOnce(['10.0.0.5']);
    await expect(validateCallbackUrl('https://internal.example/cb')).rejects.toMatchObject({
      response: expect.objectContaining({ statusCode: 400 }),
    });
  });
});
