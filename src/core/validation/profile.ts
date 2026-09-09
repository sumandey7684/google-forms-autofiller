import { z } from 'zod';

/**
 * Profile schema lives in validation so storage and messaging can share it
 * without inventing a second source of truth.
 */
export const UserProfileSchema = z.object({
  fullName: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(1).optional(),
  linkedInUrl: z.string().trim().url().optional(),
  portfolioUrl: z.string().trim().url().optional(),
  location: z.string().trim().min(1).optional(),
  notes: z.string().trim().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;
