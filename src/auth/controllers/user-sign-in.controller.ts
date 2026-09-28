import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import {
  LOGIN_THROTTLER,
  PASSWORD_RESET_THROTTLER,
} from '../../rate-limit/auth-rate-limit.constants';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { PasswordResetDto } from '../dto/password-reset.dto';
import { PasswordResetRequestDto } from '../dto/password-reset-request.dto';
import { UserLoginDto } from '../dto/user-login.dto';
import { PasswordResetService } from '../services/password-reset.service';
import { UserSignInService } from '../services/user-sign-in.service';

@Controller('user/sign-in')
export class UserSignInController {
  constructor(
    private readonly userSignInService: UserSignInService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Get('login')
  getLoginInfo() {
    return ResponseHelper.success(
      {
        fields: ['identity', 'password', 'rememberMe'],
      },
      'User login endpoint is available',
    );
  }

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ [PASSWORD_RESET_THROTTLER]: true })
  async login(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UserLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    // const { identityCookie, ...result } = await this.userSignInService.login(dto);
    const result = await this.userSignInService.login(dto);

    /* if (identityCookie) {
      response.cookie('_identity', identityCookie.value, {
        ...this.getLegacyCookieOptions(),
        expires: identityCookie.expires,
        httpOnly: true,
        path: '/',
      });
    } */

    return ResponseHelper.success(result, 'Login successful');
  }

  @Get('logout')
  async getLogout(@Res({ passthrough: true }) response: Response) {
    const result = await this.userSignInService.logout();
    // this.clearLegacyCookies(response);

    return ResponseHelper.success(result, 'Logout successful');
  }

  @Post('logout')
  async postLogout(@Res({ passthrough: true }) response: Response) {
    const result = await this.userSignInService.logout();
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
    const result = await this.passwordResetService.requestReset('user', dto);

    return ResponseHelper.success(result, 'Password reset email sent');
  }

  @Get('reset-password')
  async validateResetToken(@Query('token') token?: string) {
    if (!token) {
      return ResponseHelper.success(
        {
          fields: ['password', 'confirmPassword'],
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

    return ResponseHelper.success(
      result,
      'Password has been changed successfully.',
    );
  }

  /* private clearLegacyCookies(response: Response) {
    response.clearCookie('_identity', { path: '/' });
    response.clearCookie('_csrf', { path: '/' });
    response.clearCookie('_csrf-frontend', { path: '/' });
    response.clearCookie('_location', { path: '/' });
    response.clearCookie('PHPFRONTSESSID', { path: '/' });
    response.clearCookie('PHPBACKSESSID', { path: '/' });

    const legacyCookieOptions = this.getLegacyCookieOptions();
    if (legacyCookieOptions.domain) {
      response.clearCookie('_identity', { ...legacyCookieOptions, path: '/' });
      response.clearCookie('_csrf', { ...legacyCookieOptions, path: '/' });
      response.clearCookie('_csrf-frontend', {
        ...legacyCookieOptions,
        path: '/',
      });
      response.clearCookie('_location', { ...legacyCookieOptions, path: '/' });
      response.clearCookie('PHPFRONTSESSID', {
        ...legacyCookieOptions,
        path: '/',
      });
      response.clearCookie('PHPBACKSESSID', {
        ...legacyCookieOptions,
        path: '/',
      });
    }
  }

  private getLegacyCookieOptions(): CookieOptions {
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
      return {};
    }

    try {
      const url = new URL(baseUrl);
      const isLocalhost =
        url.hostname === 'localhost' || url.hostname === '127.0.0.1';

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
