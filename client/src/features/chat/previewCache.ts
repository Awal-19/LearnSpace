/**
 * Session-scoped cache mapping attachment IDs (or local draft IDs) to their
 * already-created local blob: URLs so images never blink or re-fetch when
 * moving from the Composer into MessageList.
 */
const previewUrlByAttachmentId = new Map<string, string>();
const activeBlobUrls = new Set<string>();

export function createTrackedBlobUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  activeBlobUrls.add(url);
  return url;
}

export function registerAttachmentPreview(attachmentId: string, blobUrl: string): void {
  previewUrlByAttachmentId.set(attachmentId, blobUrl);
}

export function getCachedAttachmentPreview(attachmentId: string): string | undefined {
  return previewUrlByAttachmentId.get(attachmentId);
}

export function revokeTrackedBlobUrl(url: string | undefined): void {
  if (!url || !activeBlobUrls.has(url)) return;
  // Do not revoke if it has been handed off to a sent message in this session.
  for (const cached of previewUrlByAttachmentId.values()) {
    if (cached === url) return;
  }
  activeBlobUrls.delete(url);
  URL.revokeObjectURL(url);
}

