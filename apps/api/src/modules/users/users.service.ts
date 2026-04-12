import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

const USER_SELECT = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        select: USER_SELECT,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);

    return { data: users, total, page, limit };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: USER_SELECT,
    });
  }

  async update(id: string, data: { email?: string; role?: string }) {
    await this.findById(id);

    const updateData: Record<string, unknown> = {};
    if (data.email) updateData.email = data.email;
    if (data.role) updateData.role = data.role;

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData as any,
      select: USER_SELECT,
    });

    this.logger.log(`User ${id} updated`);
    return updated;
  }

  async deactivate(id: string) {
    await this.findById(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: USER_SELECT,
    });

    this.logger.log(`User ${id} deactivated`);
    return user;
  }
}
