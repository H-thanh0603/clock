import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { signSession } from '../common/session';

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
        passwordHash: await bcrypt.hash(pw, 10),
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
        passwordHash: await bcrypt.hash(nw, 10),
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
