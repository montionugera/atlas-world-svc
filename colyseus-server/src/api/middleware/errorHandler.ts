/**
 * Error Handling Middleware
 * Centralized error handling for API routes
 */

import { Request, Response } from 'express'
import { ApiErrorResponse } from '../types'

/**
 * Handle API errors and send standardized error response
 * @param error - Error object
 * @param req - Express request
 * @param res - Express response
 * @param statusCode - HTTP status code (default: 500)
 */
export function handleError(
  error: Error | unknown,
  req: Request,
  res: Response,
  statusCode: number = 500
): void {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error'
  const errorName = error instanceof Error ? error.name : 'Error'
  
  console.error(`API Error [${req.method} ${req.path}]:`, error)
  
  const errorResponse: ApiErrorResponse = {
    error: errorName,
    message: errorMessage,
  }
  
  res.status(statusCode).json(errorResponse)
}

/**
 * Handle 404 Not Found errors
 * @param req - Express request
 * @param res - Express response
 * @param resource - Resource name (e.g., 'Room', 'Mob', 'Player')
 * @param resourceId - Resource ID that was not found
 * @param availableResources - Optional list of available resource IDs
 */
export function handleNotFound(
  req: Request,
  res: Response,
  resource: string,
  resourceId: string,
  availableResources?: string[]
): void {
  const errorResponse: ApiErrorResponse = {
    error: `${resource} not found`,
    [resource.toLowerCase() + 'Id']: resourceId,
  }
  
  if (availableResources) {
    errorResponse[`available${resource}s`] = availableResources
  }
  
  res.status(404).json(errorResponse)
}

