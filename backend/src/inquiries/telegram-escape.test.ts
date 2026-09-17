import { describe, expect, it } from 'vitest';
import { escapeTelegramHtml } from './inquiries.controller';

/** NV-2: trường contact/message phải escape trước khi ghép Telegram HTML. */
describe('escapeTelegramHtml', () => {
  it('escape < > & trong tên và lời nhắn', () => {
    expect(
      escapeTelegramHtml('<a href="http://evil">x</a> & chào'),
    ).toBe('&lt;a href="http://evil"&gt;x&lt;/a&gt; &amp; chào');
  });

  it('text thường giữ nguyên', () => {
    expect(escapeTelegramHtml('Nguyễn Văn A — 0901234567')).toBe(
      'Nguyễn Văn A — 0901234567',
    );
  });
});
