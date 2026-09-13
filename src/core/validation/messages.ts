import { z } from 'zod';
import { UserProfileSchema, type UserProfile } from './profile';
import { AnswerValueSchema } from './answer';
import type { Form } from '@/core/types/form';
import type { FormDetectionResult } from '@/core/types/detection';
import type { DiscoveryReport } from '@/core/types/discovery-report';
import type { ClassificationReport } from '@/core/types/classification-report';
import type { ExtractionResult } from '@/core/types/extraction-report';
import type { FillResult } from '@/core/types/fill';
import type { NavigationResult } from '@/core/types/navigation';
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
  EXTRACT_FORM: 'EXTRACT_FORM',
  FILL_FORM: 'FILL_FORM',
  INSPECT_NAVIGATION: 'INSPECT_NAVIGATION',
  NAVIGATE_FORM: 'NAVIGATE_FORM',
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

export const ExtractFormMessageSchema = z.object({
  type: z.literal(MessageType.EXTRACT_FORM),
});

const FillOperationSchema = z.object({
  questionId: z.string().min(1),
  value: AnswerValueSchema,
});

export const FillPlanSchema = z.object({
  formId: z.string().min(1),
  operations: z.array(FillOperationSchema),
  createdAt: z.string().min(1),
});

export const FillFormMessageSchema = z.object({
  type: z.literal(MessageType.FILL_FORM),
  payload: FillPlanSchema,
});

export const InspectNavigationMessageSchema = z.object({
  type: z.literal(MessageType.INSPECT_NAVIGATION),
});

export const NavigateFormMessageSchema = z.object({
  type: z.literal(MessageType.NAVIGATE_FORM),
  payload: z.object({
    action: z.enum(['next', 'back']),
  }),
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
  ExtractFormMessageSchema,
  FillFormMessageSchema,
  InspectNavigationMessageSchema,
  NavigateFormMessageSchema,
]);

export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;

const errorCodeValues = [
  ErrorCode.FORM_NOT_FOUND,
  ErrorCode.UNSUPPORTED_FORM,
  ErrorCode.EXTRACTION_FAILED,
  ErrorCode.UNSUPPORTED_QUESTION,
  ErrorCode.FILL_FAILED,
  ErrorCode.NAVIGATION_FAILED,
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
  scope: 'p12b-ai-provider-selection';
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

export interface ExtractFormResponse {
  extraction: ExtractionResult;
}

export interface FillFormResponse {
  fill: FillResult;
}

export interface InspectNavigationResponse {
  navigation: NavigationResult;
}

export interface NavigateFormResponse {
  navigation: NavigationResult;
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
  | ExtractFormResponse
  | FillFormResponse
  | InspectNavigationResponse
  | NavigateFormResponse
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
