import {
  MAX_FILE_SIZE_BYTES,
  MAX_MULTIPART_FILES_PER_REQUEST,
  MAX_PAYOUT_COMPLETION_PROOF_FILES,
} from '../constants';

describe('upload limits', () => {
  it('keeps merchant multipart proof batch aligned with internal batch upload', () => {
    expect(MAX_MULTIPART_FILES_PER_REQUEST).toBe(10);
  });

  it('aligns pay-out completion proof cap with multipart batch limit', () => {
    expect(MAX_PAYOUT_COMPLETION_PROOF_FILES).toBe(MAX_MULTIPART_FILES_PER_REQUEST);
  });

  it('sets per-file size cap at 25 MiB', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(25 * 1024 * 1024);
  });
});
