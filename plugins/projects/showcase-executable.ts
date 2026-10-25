export const MAX_EXECUTABLE_BYTES = 64 * 1024 * 1024;

/** File type validation only, not a malware verdict. Uploaded programs are never executed. */
export function isWindowsExecutable(name: string, bytes: Uint8Array): boolean {
  if (!/^[^/\\\x00-\x1f\x7f]{1,180}\.exe$/i.test(name) || bytes.length < 88
    || bytes.length > MAX_EXECUTABLE_BYTES || bytes[0] !== 0x4d || bytes[1] !== 0x5a) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pe = view.getUint32(0x3c, true);
  if (pe < 64 || pe > bytes.length - 24 || view.getUint32(pe, true) !== 0x00004550) return false;
  const flags = view.getUint16(pe + 22, true);
  // PE executable image, not a DLL renamed to .exe.
  return (flags & 0x0002) !== 0 && (flags & 0x2000) === 0;
}
