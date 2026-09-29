/** Phát hiện MIME nguy hiểm từ magic bytes / nội dung đầu file. */
export function sniffDangerousContent(sample: Buffer): string | null {
  const head = sample.subarray(0, Math.min(sample.length, 512)).toString("utf8").toLowerCase();
  const trimmed = head.trimStart();
  if (trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html") || /<script[\s>]/i.test(head)) {
    return "text/html";
  }
  if (trimmed.startsWith("<?xml") && head.includes("<svg")) {
    return "image/svg+xml";
  }
  if (trimmed.startsWith("<svg")) {
    return "image/svg+xml";
  }
  // UTF-16 LE BOM + html-ish
  if (sample.length >= 2 && sample[0] === 0xff && sample[1] === 0xfe) {
    const asUtf16 = sample.subarray(0, Math.min(sample.length, 256)).toString("utf16le").toLowerCase();
    if (asUtf16.includes("<html") || asUtf16.includes("<script")) return "text/html";
  }
  return null;
}
