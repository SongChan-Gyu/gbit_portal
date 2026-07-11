/** Content-Disposition 헤더에서 파일명 추출 */
export function parseFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = header.match(/filename\*=UTF-8''([^;\n]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* ignore */
    }
  }
  const quoted = header.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];
  const plain = header.match(/filename=([^;\n]+)/i);
  if (plain?.[1]) return plain[1].trim().replace(/^"|"$/g, "");
  return null;
}

/** xlsx(ZIP) 파일 시그니처 PK */
export function isXlsxBuffer(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** 브라우저에서 엑셀 파일 저장 (Windows Chrome UUID/확장자 누락 방지) */
export function saveXlsxBuffer(buffer: ArrayBuffer, filename: string) {
  const file = new File([buffer], filename, { type: XLSX_MIME });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.cssText = "position:fixed;left:-9999px;top:-9999px";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 3000);
}

export { XLSX_MIME };
