import { PLATFORM_SETTING_KEYS } from './platform-settings.service';

describe('platform setting keys', () => {
  it('includes pay-in autoclose defaults for CARD and FORK assignment paths', () => {
    expect(PLATFORM_SETTING_KEYS).toContain('payin_autoclose_minutes');
    expect(PLATFORM_SETTING_KEYS).toContain('payin_autoclose_minutes_fork');
  });
});
