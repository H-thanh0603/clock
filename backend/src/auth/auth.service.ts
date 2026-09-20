import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { decodeJwt } from 'jose';
import { DELEGATION_MAX_AGE, signDelegation, signSession } from '../common/session';

export type PublicUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// bcryptjs cắt input ở 72 byte — chặn input quá dài để chống CPU-DoS.
const MAX_PASSWORD_LEN = 72;
// Hash giả để so sánh khi user không tồn tại (chống timing enumeration).
const DUMMY_HASH = '$2b$10$C6UzMDM.H6dfI/f/IKcEe.8rSBp0R8uN9xQwErTYuIoPpAqS1a2b3c';

/** Cost bcrypt cấu hình được — default 10 (dev/test nhanh), prod nên 12+.
 *  BCRYPT_COST=12 ≈ 250ms/lần hash — đủ chặn brute-force offline. */
export function bcryptCost(): number {
  const n = Number(process.env.BCRYPT_COST ?? 10);
  if (!Number.isFinite(n) || n < 4 || n > 15) return 10;
  return Math.floor(n);
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private toPublic(u: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  }): PublicUser {
    return { id: u.id, email: u.email, name: u.name, role: u.role };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ user: PublicUser; token: string }> {
    const normalized = String(email ?? '').trim().toLowerCase();
    const pw = String(password ?? '');
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    // Luôn chạy bcrypt.compare (kể cả user không tồn tại) để chống timing attack.
    const ok = await bcrypt.compare(
      pw.slice(0, MAX_PASSWORD_LEN),
      user?.passwordHash ?? DUMMY_HASH,
    );
    if (!user?.passwordHash || !ok)
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    const token = await signSession({
      id: user.id,
      email: user.email,
      role: user.role,
      v: user.tokenVersion,
    });
    return { user: this.toPublic(user), token };
  }

  async register(
    email: string,
    password: string,
    name?: string,
  ): Promise<{ user: PublicUser | null; token: string | null }> {
    const normalized = String(email ?? '').trim().toLowerCase();
    const pw = String(password ?? '');
    if (!EMAIL_RE.test(normalized))
      throw new BadRequestException('Email không hợp lệ');
    if (pw.length < 6 || pw.length > MAX_PASSWORD_LEN)
      throw new BadRequestException('Mật khẩu từ 6 đến 72 ký tự');
    const exists = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    // Chống enumeration email: email đã tồn tại → trả 200 nhưng không
    // auto-login; client hiển thị thông điệp chung "kiểm tra email/đăng nhập".
    if (exists) return { user: null, token: null };

    const user = await this.prisma.user.create({
      data: {
        email: normalized,
        name: String(name ?? '').trim() || null,
        passwordHash: await bcrypt.hash(pw, bcryptCost()),
      },
    });
    const token = await signSession({
      id: user.id,
      email: user.email,
      role: user.role,
      v: user.tokenVersion,
    });
    return { user: this.toPublic(user), token };
  }

  /** Tăng tokenVersion → vô hiệu mọi token cũ (logout/đổi pass). */
  async revokeSessions(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  /**
   * Cấp vé delegation mới cho session đang sống (CUSTOMER only).
   * `dkey` ngẫu nhiên/vé → lưu vào bản ghi refresh volatile trong DB.
   */
  async issueDelegation(
    userId: string,
  ): Promise<{ token: string; expires_in: number }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role === 'ADMIN') {
      throw new UnauthorizedException('Không cấp được quyền hành động hộ');
    }
    const dkey = `${Date.now().toString(36)}${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
    await this.prisma.delegationKey.create({
      data: {
        key: dkey,
        userId: user.id,
        version: user.tokenVersion,
        expiresAt: new Date(
          Date.now() + (DELEGATION_MAX_AGE + 24 * 3600) * 1000,
        ),
      },
    });
    const token = await signDelegation(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        v: user.tokenVersion,
      },
      dkey,
    );
    return { token, expires_in: DELEGATION_MAX_AGE };
  }

  /**
   * Refresh vé cũ → vé mới, KHÔNG cần mật khẩu, với 3 kiểm tra:
   * - vé cũ verify chữ ký/aud/scope đúng (bỏ qua expiry — đúng ý nghĩa vé
   *   refresh: nó chỉ nói "tôi từng được cấp");
   * - `dkey` còn bản ghi, khớp userId yêu cầu;
   * - tokenVersion hiện tại == version lúc cấp (logout/đổi pass giết refresh).
   *
   * Vé dùng 1 lần: bản ghi cũ bị xóa (rotate). Kẻ cắp vé cũ mà user đã
   * refresh thì vé đó chết ngay (replay bị từ chối).
   */
  async refreshDelegation(
    requesterId: string,
    oldToken: string,
  ): Promise<{ token: string; expires_in: number } | null> {
    let payload: Record<string, unknown>;
    try {
      payload = decodeJwt(oldToken) as Record<string, unknown>;
    } catch {
      return null;
    }
    if (
      payload.scope !== 'shop-on-behalf' ||
      typeof payload.sub !== 'string' ||
      typeof payload.dkey !== 'string'
    ) {
      return null;
    }
    let rec: { userId: string; version: number } | null = null;
    try {
      rec = await this.prisma.delegationKey.findUnique({
        where: { key: payload.dkey },
        select: { userId: true, version: true },
      });
    } catch {
      return null;
    }
    // dkey đã dùng/xóa, hoặc vé của user khác → từ chối câm (không lộ lý do).
    if (!rec || rec.userId !== requesterId) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: requesterId },
    });
    if (!user || user.role === 'ADMIN' || user.tokenVersion !== rec.version) {
      return null;
    }
    // Rotate: xóa bản ghi cũ rồi cấp vé mới (vé dùng 1 lần).
    await this.prisma.delegationKey
      .deleteMany({ where: { key: payload.dkey } })
      .catch(() => null);
    return this.issueDelegation(requesterId);
  }

  async updateProfile(
    userId: string,
    name?: string,
  ): Promise<PublicUser | null> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name: String(name ?? '').trim().slice(0, 200) || null },
    });
    return this.toPublic(user);
  }

  async changePassword(
    userId: string,
    current: string,
    next: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user?.passwordHash)
      throw new UnauthorizedException('Tài khoản không dùng mật khẩu');
    const ok = await bcrypt.compare(
      String(current ?? '').slice(0, MAX_PASSWORD_LEN),
      user.passwordHash,
    );
    if (!ok) throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    const nw = String(next ?? '');
    if (nw.length < 6 || nw.length > MAX_PASSWORD_LEN)
      throw new BadRequestException('Mật khẩu mới từ 6 đến 72 ký tự');
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(nw, bcryptCost()),
        tokenVersion: { increment: 1 },
      },
    });
  }
  async me(userId: string): Promise<PublicUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    return user ? this.toPublic(user) : null;
  }
}
