import { request } from '../../lib/apiClient';
import { DEFAULT_DICTATION_LANGUAGE } from './mathsDictation';

export interface TranscribeResponse {
  text: string;
  language: string;
  duration: number;
}

export interface DictationPreferences {
  language: string;
  highAccuracy: boolean;
  spokenPunctuation: boolean;
  mathsDictation: boolean;
  holdToTalk: boolean;
  autoSend: boolean;
}

const PREFS_STORAGE_KEY = 'learnspace:dictation-prefs';

export const DEFAULT_DICTATION_PREFERENCES: DictationPreferences = {
  language: DEFAULT_DICTATION_LANGUAGE,
  highAccuracy: false,
  spokenPunctuation: true,
  mathsDictation: true,
  holdToTalk: false,
  autoSend: false,
};

export function loadDictationPreferences(): DictationPreferences {
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_DICTATION_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<DictationPreferences>;
    return {
      ...DEFAULT_DICTATION_PREFERENCES,
      ...parsed,
      autoSend: Boolean(parsed.autoSend),
    };
  } catch {
    return DEFAULT_DICTATION_PREFERENCES;
  }
}

export function saveDictationPreferences(prefs: DictationPreferences): void {
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota or private-mode restrictions
  }
}

export function extensionForAudioMime(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes('mp4') || lower.includes('m4a') || lower.includes('aac')) return 'm4a';
  if (lower.includes('ogg')) return 'ogg';
  if (lower.includes('wav')) return 'wav';
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3';
  return 'webm';
}

export async function transcribeAudio(params: {
  blob: Blob;
  mimeType: string;
  language: string;
  durationSeconds: number;
  vocabularyHints?: string[];
}): Promise<TranscribeResponse> {
  const ext = extensionForAudioMime(params.mimeType || params.blob.type);
  const file = new File([params.blob], `dictation.${ext}`, {
    type: params.mimeType || params.blob.type || 'audio/webm',
  });
  const formData = new FormData();
  formData.append('audio', file);
  formData.append('language', params.language);
  formData.append('durationSeconds', String(Math.max(1, Math.round(params.durationSeconds))));
  if (params.vocabularyHints && params.vocabularyHints.length > 0) {
    formData.append('hints', params.vocabularyHints.slice(0, 25).join(', '));
  }

  return request<TranscribeResponse>('/ai/transcribe', {
    method: 'POST',
    body: formData,
  });
}
