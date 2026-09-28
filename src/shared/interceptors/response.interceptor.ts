import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import * as Sentry from '@sentry/nestjs';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errorCode?: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // If the response is already formatted (has success property)
        if (data && typeof data === 'object' && 'success' in data) {
          const response = data as ApiResponse<any>;
          
          // If success is false, convert to HttpException with appropriate status code
          if (response.success === false) {
            const statusCode = this.getStatusFromErrorCode(response.errorCode || 'INTERNAL_SERVER_ERROR');
            throw new HttpException(response, statusCode);
          }
          
          // Otherwise return successful response as is
          return response;
        }

        // Otherwise, wrap in standard success format
        return {
          success: true,
          data: data,
          message: 'Operation successful',
        };
      }),
      catchError((error) => {
        // Capture error to Sentry before formatting the response
        // This ensures Sentry gets the original error with full stack trace
        if (error instanceof Error) {
          Sentry.captureException(error);
        } else {
          Sentry.captureException(new Error(String(error)));
        }

        let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
        let errorCode = 'INTERNAL_SERVER_ERROR';
        let message = 'An unexpected error occurred';

        if (error instanceof HttpException) {
          statusCode = error.getStatus();
          const errorResponse = error.getResponse();
          
          if (typeof errorResponse === 'object' && errorResponse !== null) {
            const responseObj = errorResponse as any;
            // If the response is already formatted with success: false, use it directly
            if (responseObj.success === false && responseObj.errorCode && responseObj.message) {
              return throwError(() => new HttpException(responseObj, statusCode));
            }
            // Otherwise extract and format
            errorCode = responseObj.errorCode || this.getErrorCodeFromStatus(statusCode);
            message = responseObj.message || error.message;
          } else {
            message = error.message;
            errorCode = this.getErrorCodeFromStatus(statusCode);
          }
        } else if (error.name === 'ValidationError') {
          statusCode = HttpStatus.BAD_REQUEST;
          errorCode = 'VALIDATION_ERROR';
          message = error.message;
        } else if (error.name === 'QueryFailedError') {
          statusCode = HttpStatus.BAD_REQUEST;
          errorCode = 'DATABASE_ERROR';
          message = 'Database operation failed';
        } else if (error instanceof Error) {
          // Preserve error message for plain Error objects
          // In production, you might want to hide internal error details for security
          message = error.message || 'An unexpected error occurred';
          errorCode = error.name !== 'Error' ? error.name : 'INTERNAL_SERVER_ERROR';
        }

        const formattedError = {
          success: false,
          errorCode,
          message,
        };

        return throwError(() => new HttpException(formattedError, statusCode));
      }),
    );
  }

  private getErrorCodeFromStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'VALIDATION_ERROR';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMIT_EXCEEDED';
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return 'INTERNAL_SERVER_ERROR';
      default:
        return 'UNKNOWN_ERROR';
    }
  }

  private getStatusFromErrorCode(errorCode: string): number {
    switch (errorCode) {
      case 'BAD_REQUEST':
      case 'VALIDATION_ERROR':
      case 'DATABASE_ERROR':
        return HttpStatus.BAD_REQUEST;
      case 'UNAUTHORIZED':
        return HttpStatus.UNAUTHORIZED;
      case 'FORBIDDEN':
        return HttpStatus.FORBIDDEN;
      case 'NOT_FOUND':
        return HttpStatus.NOT_FOUND;
      case 'CONFLICT':
        return HttpStatus.CONFLICT;
      case 'RATE_LIMIT_EXCEEDED':
        return HttpStatus.TOO_MANY_REQUESTS;
      case 'INTERNAL_SERVER_ERROR':
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }
}
