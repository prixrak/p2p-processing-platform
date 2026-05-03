import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  AuthService,
  LOGIN_ACCOUNT_DEACTIVATED_MESSAGE,
} from './auth.service';
import * as passwordUtil from '../../common/utils/password';
import { UserRole } from '@p2p/shared';

jest.mock('../../common/utils/password', () => ({
  comparePassword: jest.fn(),
}));

describe('AuthService', () => {
  const comparePassword = passwordUtil.comparePassword as jest.Mock;

  function createService() {
    const prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    };
    const jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    };
    const service = new AuthService(prisma as any, jwtService as any);
    return { service, prisma, jwtService };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('returns tokens when user is active and password matches', async () => {
      const { service, prisma, jwtService } = createService();
      const row = {
        id: 'u1',
        email: 'a@b.com',
        passwordHash: 'hash',
        isActive: true,
        twoFaSecret: null as string | null,
        role: UserRole.TRADER,
      };
      prisma.user.findUnique.mockResolvedValue(row);
      comparePassword.mockResolvedValue(true);
      jwtService.signAsync
        .mockResolvedValueOnce('access')
        .mockResolvedValueOnce('refresh');

      const res = await service.login('a@b.com', 'secret');

      expect(res).toEqual({
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 'u1', email: 'a@b.com', role: UserRole.TRADER },
      });
    });

    it('throws when email is unknown', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login('x@y.com', 'secret')).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
      expect(comparePassword).not.toHaveBeenCalled();
    });

    it('throws when password does not match', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        passwordHash: 'hash',
        isActive: true,
        role: UserRole.TRADER,
      });
      comparePassword.mockResolvedValue(false);

      await expect(service.login('a@b.com', 'wrong')).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
    });

    it('throws a deactivated message when password matches but user is inactive', async () => {
      const { service, prisma } = createService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        passwordHash: 'hash',
        isActive: false,
        twoFaSecret: null,
        role: UserRole.TRADER,
      });
      comparePassword.mockResolvedValue(true);

      await expect(service.login('a@b.com', 'secret')).rejects.toThrow(
        new UnauthorizedException(LOGIN_ACCOUNT_DEACTIVATED_MESSAGE),
      );
    });
  });

  describe('verify2FALogin', () => {
    it('throws deactivated message when user became inactive before 2FA step', async () => {
      const { service, prisma, jwtService } = createService();
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'u1',
        type: '2fa-pending',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        role: UserRole.TRADER,
        isActive: false,
        twoFaSecret: 'secret',
      });

      await expect(service.verify2FALogin('temp', '123456')).rejects.toThrow(
        new UnauthorizedException(LOGIN_ACCOUNT_DEACTIVATED_MESSAGE),
      );
    });
  });

  describe('refreshToken', () => {
    it('throws deactivated message when user is inactive', async () => {
      const { service, prisma, jwtService } = createService();
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'u1',
        email: 'a@b.com',
        role: UserRole.TRADER,
        type: 'refresh',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        role: UserRole.TRADER,
        isActive: false,
      });

      await expect(service.refreshToken('tok')).rejects.toThrow(
        new UnauthorizedException(LOGIN_ACCOUNT_DEACTIVATED_MESSAGE),
      );
    });
  });
});
