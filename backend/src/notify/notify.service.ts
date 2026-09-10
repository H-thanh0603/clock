import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

export type OrderNotify = {
  code: string;
  status: string;
  customerName: string;
  contact: string;
  totalUsd: number;
  totalVnd: number;
  paidUsd: number;
  method: string;
  itemCount: number;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Thông tin 1 lần gửi trong hàng đợi retry. */
type QueuedSend = {
  /** Fn gửi thật (telegram/email) — resolve true nếu gửi thành công. */
  send: () => Promise<boolean>;
  label: string;
  attempts: number;
  nextAt: number;
};

const MAX_ATTEMPTS = 3;
/** Backoff: 30s → 2 phút → 8 phút (nhân 4 mỗi lần). */
const BASE_DELAY_MS = 30_000;

/**
 * Thông báo đơn hàng. Mọi kênh đều optional theo env — thiếu cấu hình thì
 * bỏ qua êm (log), không bao giờ làm hỏng luồng đặt hàng.
 * - Telegram: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (báo admin đơn mới/paid)
 * - Email: SMTP_HOST/PORT/USER/PASS + SMTP_FROM (gửi khách nếu contact là email)
 *
 * Vì sao không BullMQ: 1 backend instance, notify ~ vài chục/ngày —
 * hàng đợi in-memory + retry với backoff là đủ (audit recommends queue
 * "khi đơn/ngày > ~500"). Khi tách nhiều instance BE hoặc cần DLQ mới
 * cân nhắc Redis/BullMQ.
 *
 * QUAN TRỌNG: mọi gửi đều đi qua enqueue (không await trong request của
 * khách): SMTP chậm 5s không giữ khách chờ 5s; Telegram rate-limit tạm
 * thời → retry 3 lần thay vì mất thông báo (trước đây swallow-error).
 */
@Injectable()
export class NotifyService {
  private readonly log = new Logger(NotifyService.name);
  private queue: QueuedSend[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  private tgEnabled() {
    return Boolean(
      process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID,
    );
  }

  private smtpEnabled() {
    return Boolean(
      process.env.SMTP_HOST &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS,
    );
  }

  /** Thêm vào hàng đợi — trả về NGAY, không chờ gửi xong. */
  private enqueue(label: string, send: () => Promise<boolean>) {
    this.queue.push({ label, send, attempts: 0, nextAt: Date.now() });
    this.schedule();
  }

  /** Đẩy đúng 1 item (lIFO ưu tiên mới nhất cho timer gọn). */
  private schedule() {
    if (this.timer) return; // đã có tick tới
    const next = this.queue.reduce(
      (min, q) => Math.min(min, q.nextAt),
      Infinity,
    );
    const delay = Math.max(0, next - Date.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, delay);
    // Timer không giữ event loop sống một mình — process chạy Nest luôn sống.
    if (typeof this.timer === 'object' && 'unref' in this.timer)
      (this.timer as unknown as { unref: () => void }).unref();
  }

  /** Vòng gửi: mọi item đến giờ → gửi; fail → backoff hoặc bỏ. */
  private async tick() {
    const now = Date.now();
    const due = this.queue.filter((q) => q.nextAt <= now);
    this.queue = this.queue.filter((q) => q.nextAt > now);

    for (const item of due) {
      try {
        const ok = await item.send();
        if (ok) continue;
        throw new Error('send returned false');
      } catch (e) {
        item.attempts++;
        if (item.attempts >= MAX_ATTEMPTS) {
          this.log.error(
            `Bỏ thông báo "${item.label}" sau ${MAX_ATTEMPTS} lần thử: ${(e as Error).message}`,
          );
          continue;
        }
        item.nextAt =
          Date.now() + BASE_DELAY_MS * Math.pow(4, item.attempts - 1);
        this.queue.push(item);
      }
    }
    if (this.queue.length > 0) this.schedule();
  }

  /** Gửi Telegram (resolve true nếu HTTP 2xx). */
  async telegram(text: string): Promise<boolean> {
    if (!this.tgEnabled()) return true; // không cấu hình = coi như hoàn tất
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      },
    );
    if (!res.ok) {
      this.log.warn(`Telegram HTTP ${res.status}`);
      return false;
    }
    return true;
  }

  /** Gửi email SMTP (resolve true khi sendMail thành công). */
  async email(to: string, subject: string, text: string): Promise<boolean> {
    if (!this.smtpEnabled()) return true;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to,
      subject,
      text,
    });
    return true;
  }

  private fmtVnd(n: number): string {
    return `${n.toLocaleString('vi-VN')} ₫`;
  }

  /** Đơn mới (mọi phương thức) — KHÔNG chặn response đặt hàng. */
  async orderCreated(o: OrderNotify): Promise<void> {
    const lines = [
      `🧾 <b>Đơn mới ${o.code}</b> (${o.status})`,
      `Khách: ${o.customerName} — ${o.contact}`,
      `Món: ${o.itemCount} • Tổng: $${o.totalUsd.toLocaleString()} (~${this.fmtVnd(o.totalVnd)})`,
      `Đã thu: $${o.totalUsd === 0 ? 0 : o.paidUsd.toLocaleString()} qua ${o.method}`,
    ];
    this.enqueue(`telegram:đơn ${o.code}`, () =>
      this.telegram(lines.join('\n')),
    );
    const to = o.contact.trim();
    if (EMAIL_RE.test(to)) {
      this.enqueue(`email:đơn ${o.code}`, () =>
        this.email(
          to,
          `[Aurel & Co.] Đã nhận đơn ${o.code}`,
          `Kính chào ${o.customerName},\n\nAtelier đã nhận đơn ${o.code} trị giá $${o.totalUsd.toLocaleString()} (~${this.fmtVnd(o.totalVnd)}).\nConcierge sẽ liên hệ xác nhận trong 2 giờ làm việc.\n\nTrân trọng,\nAurel & Co.`,
        ),
      );
    }
  }

  /** VNPay success (return hoặc IPN) — KHÔNG chặn callback thanh toán. */
  async orderPaid(code: string, totalVnd: number): Promise<void> {
    this.enqueue(`telegram:paid ${code}`, () =>
      this.telegram(
        `✅ <b>VNPay thành công ${code}</b>\nSố tiền: ${this.fmtVnd(totalVnd)}`,
      ),
    );
  }

  /** Text tự do qua Telegram (inquiry/concierge) — queue + retry. */
  async enqueueText(text: string): Promise<void> {
    this.enqueue('telegram:text', () => this.telegram(text));
  }

  /** Email tự do (inquiry/concierge) — queue + retry. */
  async enqueueEmail(
    to: string,
    subject: string,
    text: string,
  ): Promise<void> {
    this.enqueue(`email:${to}`, () => this.email(to, subject, text));
  }

  /** Dùng trong test: đợi hàng đợi xả hết (không timmer rò rỉ). */
  async drainForTest(): Promise<void> {
    let guard = 0;
    while (this.queue.length > 0 && guard < 50) {
      await this.tick();
      if (this.queue.length > 0 && this.queue[0].nextAt > Date.now()) {
        // còn item chờ backoff → không đợi thật trong test, ép due.
        this.queue.forEach((q) => (q.nextAt = 0));
      }
      guard++;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
