import {
  ConflictException,
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
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    if (!user?.passwordHash)
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    const ok = await bcrypt.compare(String(password ?? ''), user.passwordHash);
    if (!ok) throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    const token = await signSession({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    return { user: this.toPublic(user), token };
  }

  async register(
    email: string,
    password: string,
    name?: string,
  ): Promise<{ user: PublicUser; token: string }> {
    const normalized = String(email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(normalized))
      throw new BadRequestException('Email không hợp lệ');
    if (String(password ?? '').length < 6)
      throw new BadRequestException('Mật khẩu tối thiểu 6 ký tự');
    const exists = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    if (exists) throw new ConflictException('Email đã được đăng ký');
    const user = await this.prisma.user.create({
      data: {
        email: normalized,
        name: String(name ?? '').trim() || null,
        passwordHash: await bcrypt.hash(String(password), 10),
      },
    });
    const token = await signSession({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    return { user: this.toPublic(user), token };
  }

  async me(userId: string): Promise<PublicUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    return user ? this.toPublic(user) : null;
  }
}
