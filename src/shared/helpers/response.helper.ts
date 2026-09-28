import { ApiResponse } from '../interceptors/response.interceptor';

export class ResponseHelper {
  /**
   * Creates a standardized success response
   * @param data - The data to return
   * @param message - Optional success message
   * @returns Formatted success response
   */
  static success<T>(data: T, message: string = 'Operation successful'): ApiResponse<T> {
    return {
      success: true,
      data,
      message,
    };
  }

  /**
   * Creates a standardized success response without data
   * @param message - Success message
   * @returns Formatted success response
   */
  static successMessage(message: string): ApiResponse<null> {
    return {
      success: true,
      data: null,
      message,
    };
  }

  /**
   * Creates a standardized error response
   * @param errorCode - Error code for client handling
   * @param message - Error message
   * @returns Formatted error response
   */
  static error(errorCode: string, message: string): ApiResponse<null> {
    return {
      success: false,
      errorCode,
      message,
    };
  }

  /**
   * Creates a paginated response
   * @param data - Array of items
   * @param total - Total number of items
   * @param page - Current page number
   * @param limit - Items per page
   * @param message - Optional success message
   * @returns Formatted paginated response
   */
  static paginated<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
    message: string = 'Data retrieved successfully',
  ): ApiResponse<{
    items: T[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const totalPages = Math.ceil(total / limit);
    
    return {
      success: true,
      data: {
        items: data,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      message,
    };
  }

  /**
   * Common error responses
   */
  static readonly errors = {
    NOT_FOUND: (resource: string) => 
      ResponseHelper.error('NOT_FOUND', `${resource} not found`),
    
    VALIDATION_ERROR: (message: string = 'Validation failed') => 
      ResponseHelper.error('VALIDATION_ERROR', message),
    
    UNAUTHORIZED: (message: string = 'Unauthorized access') => 
      ResponseHelper.error('UNAUTHORIZED', message),
    
    FORBIDDEN: (message: string = 'Access forbidden') => 
      ResponseHelper.error('FORBIDDEN', message),
    
    CONFLICT: (message: string = 'Resource conflict') => 
      ResponseHelper.error('CONFLICT', message),
    
    INTERNAL_ERROR: (message: string = 'Internal server error') => 
      ResponseHelper.error('INTERNAL_SERVER_ERROR', message),
    
    BAD_REQUEST: (message: string = 'Bad request') => 
      ResponseHelper.error('BAD_REQUEST', message),
  };
}
