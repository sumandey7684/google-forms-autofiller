import type { SavedAnswer } from '@/core/resolution/types';
import {
  SavedAnswerSchema,
  SavedAnswersSchema,
} from '@/core/validation/saved-answers';

const SAVED_ANSWERS_STORAGE_KEY = 'savedAnswers' as const;

export async function getSavedAnswers(): Promise<readonly SavedAnswer[]> {
  const result = await chrome.storage.local.get(SAVED_ANSWERS_STORAGE_KEY);
  const raw = result[SAVED_ANSWERS_STORAGE_KEY];
  if (raw === undefined) {
    return [];
  }

  const parsed = SavedAnswersSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export async function saveSavedAnswers(
  savedAnswers: readonly SavedAnswer[],
): Promise<readonly SavedAnswer[]> {
  const parsed = SavedAnswersSchema.parse(savedAnswers);
  await chrome.storage.local.set({
    [SAVED_ANSWERS_STORAGE_KEY]: parsed,
  });
  return parsed;
}

function compareKeys(left: SavedAnswer, right: SavedAnswer): number {
  if (left.key < right.key) return -1;
  if (left.key > right.key) return 1;
  return 0;
}

export async function upsertSavedAnswer(
  savedAnswer: SavedAnswer,
): Promise<SavedAnswer> {
  const timestamped = SavedAnswerSchema.parse({
    ...savedAnswer,
    updatedAt: new Date().toISOString(),
  });
  const current = await getSavedAnswers();
  const next = [
    ...current.filter((entry) => entry.key !== timestamped.key),
    timestamped,
  ].sort(compareKeys);
  await saveSavedAnswers(next);
  return timestamped;
}

export async function clearSavedAnswers(): Promise<void> {
  await chrome.storage.local.remove(SAVED_ANSWERS_STORAGE_KEY);
}
