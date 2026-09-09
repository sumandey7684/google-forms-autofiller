import { z } from 'zod';
import { UserProfileSchema, type UserProfile } from './profile';
import type { Form } from '@/core/types/form';
import type { FormDetectionResult } from '@/core/types/detection';
import type { DiscoveryReport } from '@/core/types/discovery-report';
import type { ClassificationReport } from '@/core/types/classification-report';
import type { AppError } from '@/core/types/errors';
import { ErrorCode } from '@/core/types/errors';

/**
 * Central message contract for popup ↔ background ↔ content.
 * Zod validates at extension boundaries; TypeScript types guide internal code.
 */

export const MessageType = {
  PING: 'PING',
  PONG: 'PONG',
  GET_EXTENSION_STATUS: 'GET_EXTENSION_STATUS',
  GET_PROFILE: 'GET_PROFILE',
  SAVE_PROFILE: 'SAVE_PROFILE',
  DETECT_FORM: 'DETECT_FORM',
  GET_FORM: 'GET_FORM',
  DISCOVER_FORM: 'DISCOVER_FORM',
  CLASSIFY_FORM: 'CLASSIFY_FORM',
} as const;

export type MessageTypeName = (typeof MessageType)[keyof typeof MessageType];

export const PingMessageSchema = z.object({
  type: z.literal(MessageType.PING),
});

export const GetExtensionStatusMessageSchema = z.object({
  type: z.literal(MessageType.GET_EXTENSION_STATUS),
});

export const GetProfileMessageSchema = z.object({
  type: z.literal(MessageType.GET_PROFILE),
});

export const SaveProfileMessageSchema = z.object({
  type: z.literal(MessageType.SAVE_PROFILE),
  payload: UserProfileSchema,
});

export const DetectFormMessageSchema = z.object({
  type: z.literal(MessageType.DETECT_FORM),
});

export const GetFormMessageSchema = z.object({
  type: z.literal(MessageType.GET_FORM),
});

export const DiscoverFormMessageSchema = z.object({
  type: z.literal(MessageType.DISCOVER_FORM),
});

export const ClassifyFormMessageSchema = z.object({
  type: z.literal(MessageType.CLASSIFY_FORM),
});

export const ExtensionMessageSchema = z.discriminatedUnion('type', [
  PingMessageSchema,
  GetExtensionStatusMessageSchema,
  GetProfileMessageSchema,
  SaveProfileMessageSchema,
  DetectFormMessageSchema,
  GetFormMessageSchema,
  DiscoverFormMessageSchema,
  ClassifyFormMessageSchema,
]);

export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;

const errorCodeValues = [
  ErrorCode.FORM_NOT_FOUND,
  ErrorCode.UNSUPPORTED_FORM,
  ErrorCode.EXTRACTION_FAILED,
  ErrorCode.UNSUPPORTED_QUESTION,
  ErrorCode.FILL_FAILED,
  ErrorCode.INVALID_REQUEST,
] as const;

export const AppErrorSchema = z.object({
  code: z.enum(errorCodeValues),
  message: z.string().min(1),
  details: z
    .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
});

export function toAppError(value: unknown): AppError | null {
  const parsed = AppErrorSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  const { code, message, details } = parsed.data;
  if (details === undefined) {
    return { code, message };
  }
  return { code, message, details };
}

export interface PongResponse {
  type: typeof MessageType.PONG;
  source: 'background' | 'content' | 'popup';
}

export interface ExtensionStatusResponse {
  version: string;
  ready: boolean;
  scope: 'p3-classification';
}

export interface ProfileResponse {
  profile: UserProfile | null;
}

export interface SaveProfileResponse {
  profile: UserProfile;
}

export interface DetectFormResponse {
  detection: FormDetectionResult;
}

export interface GetFormResponse {
  form: Form;
}

export interface DiscoverFormResponse {
  discovery: DiscoveryReport;
}

export interface ClassifyFormResponse {
  classification: ClassificationReport;
}

export interface ErrorResponse {
  error: AppError;
}

export type ExtensionResponse =
  | PongResponse
  | ExtensionStatusResponse
  | ProfileResponse
  | SaveProfileResponse
  | DetectFormResponse
  | GetFormResponse
  | DiscoverFormResponse
  | ClassifyFormResponse
  | ErrorResponse;

export function isErrorResponse(value: unknown): value is ErrorResponse {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }
  return toAppError((value as ErrorResponse).error) !== null;
}

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  return ExtensionMessageSchema.safeParse(value).success;
}
