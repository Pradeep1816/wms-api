import { Body, Controller, Get, Post, Query, Req, Res, UseGuards, ValidationPipe } from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import {
  LOGIN_THROTTLER,
  PASSWORD_RESET_THROTTLER,
} from '../../rate-limit/auth-rate-limit.constants';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { AdminLoginDto } from '../dto/admin-login.dto';
import { PasswordResetDto } from '../dto/password-reset.dto';
import { PasswordResetRequestDto } from '../dto/password-reset-request.dto';
import { AdminSignInService } from '../services/admin-sign-in.service';
import { PasswordResetService } from '../services/password-reset.service';

@Controller('admin/sign-in')
export class SignInController {
  constructor(
    private readonly adminSignInService: AdminSignInService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Get('login')
  getLoginInfo() {
    return ResponseHelper.success(
      {
        fields: ['email', 'password', 'rememberMe'],
      },
      'Admin login endpoint is available',
    );
  }

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ [PASSWORD_RESET_THROTTLER]: true })
  async login(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: AdminLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    // const { legacySession, ...result } = await this.adminSignInService.login(dto);
    const result = await this.adminSignInService.login(dto);
    // this.setLegacyCookies(response, legacySession);

    return ResponseHelper.success(result, 'Login successful');
  }

  @Get('logout')
  async getLogout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    // const result = await this.adminSignInService.logout(this.getCookie(request, 'PHPBACKSESSID'));
    const result = await this.adminSignInService.logout();
    // this.clearLegacyCookies(response);

    return ResponseHelper.success(result, 'Logout successful');
  }

  @Post('logout')
  async postLogout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    // const result = await this.adminSignInService.logout(this.getCookie(request, 'PHPBACKSESSID'));
    const result = await this.adminSignInService.logout();
    // this.clearLegacyCookies(response);

    return ResponseHelper.success(result, 'Logout successful');
  }

  @Get('request-password-reset')
  getRequestPasswordResetInfo() {
    return ResponseHelper.success(
      {
        fields: ['email'],
      },
      'Password reset request endpoint is available',
    );
  }

  @Post('request-password-reset')
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ [LOGIN_THROTTLER]: true })
  async requestPasswordReset(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: PasswordResetRequestDto,
  ) {
    const result = await this.passwordResetService.requestReset('admin', dto);

    return ResponseHelper.success(result, 'Password reset email sent');
  }

  @Get('reset-password')
  async validateResetToken(@Query('token') token?: string) {
    if (!token) {
      return ResponseHelper.success(
        {
          fields: ['password', 'reenterpassword'],
        },
        'Password reset endpoint is available',
      );
    }

    const result = await this.passwordResetService.validateResetToken(token);

    return ResponseHelper.success(result, 'Password reset token is valid');
  }

  @Post('reset-password')
  async resetPassword(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: PasswordResetDto,
  ) {
    const result = await this.passwordResetService.resetPassword(dto);

    return ResponseHelper.success(result, 'Password has been changed successfully.');
  }

  /* private setLegacyCookies(
    response: Response,
    legacySession: Awaited<
      ReturnType<AdminSignInService['login']>
    >['legacySession'],
  ) {
    response.cookie('PHPBACKSESSID', legacySession.sessionId, {
      ...this.getLegacyCookieOptions(),
      httpOnly: true,
      path: '/admin',
    });
    response.cookie('PHPBACKSESSID', legacySession.sessionId, {
      ...this.getLegacyCookieOptions(),
      httpOnly: true,
      path: '/',
    });

    if (legacySession.identityCookie) {
      response.cookie('_identity', legacySession.identityCookie.value, {
        ...this.getLegacyCookieOptions(),
        expires: legacySession.identityCookie.expires,
        httpOnly: true,
        path: '/',
      });
    }
  }

  private clearLegacyCookies(response: Response) {
    response.clearCookie('PHPBACKSESSID', { path: '/' });
    response.clearCookie('PHPBACKSESSID', { path: '/admin' });
    response.clearCookie('_identity', { path: '/' });

    const legacyCookieOptions = this.getLegacyCookieOptions();
    if (legacyCookieOptions.domain) {
      response.clearCookie('PHPBACKSESSID', {
        ...legacyCookieOptions,
        path: '/',
      });
      response.clearCookie('PHPBACKSESSID', {
        ...legacyCookieOptions,
        path: '/admin',
      });
      response.clearCookie('_identity', { ...legacyCookieOptions, path: '/' });
    }
  }

  private getCookie(request: Request, name: string): string | undefined {
    const cookies = request.headers.cookie?.split(';') || [];

    for (const cookie of cookies) {
      const [rawName, ...rawValue] = cookie.trim().split('=');
      if (rawName === name) {
        return decodeURIComponent(rawValue.join('='));
      }
    }

    return undefined;
  }

  private getLegacyCookieOptions(): CookieOptions {
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
      return {};
    }

    try {
      const url = new URL(baseUrl);
      const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

      if (isLocalhost || !url.hostname.includes('.')) {
        return {};
      }

      return {
        domain: url.hostname,
        secure: url.protocol === 'https:',
      };
    } catch {
      return {};
    }
  } */
}
