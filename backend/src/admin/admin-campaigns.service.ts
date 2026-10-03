import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { copyCheck } from '../common/jev';

/**
 * Cụm Campaign của backoffice (CONTEXT.md: Campaign) — tách khỏi Promotion:
 * campaign là marketing (ngân sách/đối tượng/nội dung), không đụng giá SP.
 */
@Injectable()
export class AdminCampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  async listCampaigns(status?: string) {
    return this.prisma.campaign.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async createCampaign(
    body: {
      name?: unknown;
      objective?: unknown;
      audience?: unknown;
      budgetUsd?: unknown;
      copyText?: unknown;
      startsAt?: unknown;
      endsAt?: unknown;
    },
    byUserId?: string,
  ) {
    const name = String(body.name ?? '').trim().slice(0, 80);
    if (!name) throw new BadRequestException('Thiếu tên campaign');
    const budgetUsd = Math.max(0, Math.floor(Number(body.budgetUsd) || 0));
    const parseOpt = (v: unknown) => {
      if (v === undefined || v === null || v === '') return null;
      const d = new Date(String(v));
      return Number.isNaN(+d) ? null : d;
    };
    const row = await this.prisma.campaign.create({
      data: {
        name,
        objective: body.objective ? String(body.objective).slice(0, 200) : null,
        audience: body.audience ? String(body.audience).slice(0, 300) : null,
        budgetUsd,
        copyText: body.copyText ? String(body.copyText).slice(0, 600) : null,
        status: 'draft',
        startsAt: parseOpt(body.startsAt),
        endsAt: parseOpt(body.endsAt),
        createdById: byUserId ?? null,
      },
    });
    // Jev copy guardrail (chặn mềm): copyText có claim rủi ro/mơ hồ → kèm
    // warning để admin sửa trước khi active. Vẫn tạo draft, không block.
    const copy = body.copyText ? String(body.copyText).slice(0, 600) : '';
    const warn = copy ? await copyCheck('campaign', copy) : null;
    return warn ? { ...row, jevWarning: warn.warning } : row;
  }

  async updateCampaign(id: string, body: Record<string, unknown>) {
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).slice(0, 80);
    if (body.objective !== undefined)
      data.objective = body.objective ? String(body.objective).slice(0, 200) : null;
    if (body.audience !== undefined)
      data.audience = body.audience ? String(body.audience).slice(0, 300) : null;
    if (body.copyText !== undefined)
      data.copyText = body.copyText ? String(body.copyText).slice(0, 600) : null;
    if (body.budgetUsd !== undefined)
      data.budgetUsd = Math.max(0, Math.floor(Number(body.budgetUsd) || 0));
    if (body.status !== undefined) {
      const s = String(body.status);
      if (!['draft', 'active', 'paused', 'ended'].includes(s))
        throw new BadRequestException('Status campaign không hợp lệ');
      data.status = s;
    }
    try {
      return await this.prisma.campaign.update({ where: { id }, data });
    } catch {
      throw new NotFoundException('Không thấy campaign');
    }
  }
}
