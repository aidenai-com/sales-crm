/**
 * File types and sizes for deal deliverable attachments.
 *
 * These mirror `backend/app/services/storage.py`. The server is the boundary that matters —
 * it re-validates every presign request — but the client needs the same list so the file
 * picker filters rather than letting a rep choose a file that is refused a moment later.
 *
 * Keep the two in step. A type allowed here but not there produces a 415 after the user has
 * already chosen the file, which reads as a bug rather than a rule.
 */

/** For an `<input type="file">` accept attribute. */
export const ALLOWED_UPLOAD_ACCEPT = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.msg',
  '.txt',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
].join(',')

/** 25 MiB, matching the server's MAX_UPLOAD_BYTES default. */
export const MAX_UPLOAD_BYTES = 26_214_400

/**
 * A file size a person can read: "412 KB", "2.4 MB".
 *
 * Binary units with decimal labels, which is what every desktop OS shows — being technically
 * correct with KiB here would mean the CRM disagreeing with the number in the user's own file
 * browser about the same file.
 */
export function describeFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`
}
