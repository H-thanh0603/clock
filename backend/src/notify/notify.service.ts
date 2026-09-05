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

/**
 * Thông báo đơn hàng. Mọi kênh đều optional theo env — thiếu cấu hình thì
 * bỏ qua êm (log), không bao giờ làm hỏng luồng đặt hàng.
 * - Telegram: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (báo admin đơn mới/paid)
 * - Email: SMTP_HOST/PORT/USER/PASS + SMTP_FROM (gửi khách nếu contact là email)
 */
@Injectable()
export class NotifyService {
  private readonly log = new Logger(NotifyService.name);

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

  async telegram(text: string): Promise<void> {
    if (!this.tgEnabled()) return;
    try {
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
      if (!res.ok)
        this.log.warn(`Telegram báo lỗi HTTP ${res.status}`);
    } catch (e) {
      this.log.warn(`Gửi Telegram thất bại: ${(e as Error).message}`);
    }
  }

  async email(to: string, subject: string, text: string): Promise<void> {
    if (!this.smtpEnabled()) return;
    try {
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
    } catch (e) {
      this.log.warn(`Gửi email thất bại: ${(e as Error).message}`);
    }
  }

  private fmtVnd(n: number): string {
    return `${n.toLocaleString('vi-VN')} ₫`;
  }

  /** Đơn mới (mọi phương thức). */
  async orderCreated(o: OrderNotify): Promise<void> {
    const lines = [
      `🧾 <b>Đơn mới ${o.code}</b> (${o.status})`,
      `Khách: ${o.customerName} — ${o.contact}`,
      `Món: ${o.itemCount} • Tổng: $${o.totalUsd.toLocaleString()} (~${this.fmtVnd(o.totalVnd)})`,
      `Đã thu: $${o.totalUsd === 0 ? 0 : o.paidUsd.toLocaleString()} qua ${o.method}`,
    ];
    await this.telegram(lines.join('\n'));
    if (EMAIL_RE.test(o.contact.trim())) {
      await this.email(
        o.contact.trim(),
        `[Aurel & Co.] Đã nhận đơn ${o.code}`,
        `Kính chào ${o.customerName},\n\nAtelier đã nhận đơn ${o.code} trị giá $${o.totalUsd.toLocaleString()} (~${this.fmtVnd(o.totalVnd)}).\nConcierge sẽ liên hệ xác nhận trong 2 giờ làm việc.\n\nTrân trọng,\nAurel & Co.`,
      );
    }
  }

  /** VNPay success (return hoặc IPN). */
  async orderPaid(code: string, totalVnd: number): Promise<void> {
    await this.telegram(
      `✅ <b>VNPay thành công ${code}</b>\nSố tiền: ${this.fmtVnd(totalVnd)}`,
    );
  }
}
