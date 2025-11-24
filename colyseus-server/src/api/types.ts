/**
 * Shared TypeScript types for API module
 */

import { Request, Response } from 'express'

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  error: string
  message?: string
  [key: string]: any
}

/**
 * Standard API success response with data
 */
export interface ApiSuccessResponse<T = any> {
  [key: string]: T | any
}

/**
 * Route handler type
 */
export type RouteHandler = (req: Request, res: Response) => Promise<void> | void

/**
 * Parsed query parameters for player IDs
 */
export interface ParsedPlayerIds {
  ids: string[] | null
}

