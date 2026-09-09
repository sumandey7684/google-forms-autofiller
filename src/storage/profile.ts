import {
  UserProfileSchema,
  type UserProfile,
} from '@/core/validation/profile';

export { UserProfileSchema, type UserProfile };

const PROFILE_STORAGE_KEY = 'userProfile' as const;

export async function getProfile(): Promise<UserProfile | null> {
  const result = await chrome.storage.local.get(PROFILE_STORAGE_KEY);
  const raw = result[PROFILE_STORAGE_KEY];
  if (raw === undefined) {
    return null;
  }

  const parsed = UserProfileSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function saveProfile(profile: UserProfile): Promise<UserProfile> {
  const parsed = UserProfileSchema.parse(profile);
  const withTimestamp: UserProfile = {
    ...parsed,
    updatedAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [PROFILE_STORAGE_KEY]: withTimestamp });
  return withTimestamp;
}

export async function clearProfile(): Promise<void> {
  await chrome.storage.local.remove(PROFILE_STORAGE_KEY);
}
