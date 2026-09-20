export interface PdfPage {
  mime: string;
  base64: string;
}

/**
 * Render halaman-halaman PDF menjadi PNG (base64) menggunakan pdfjs
 * (via pdf-to-img v7, tanpa dependency native canvas).
 * Maksimal `maxPages` halaman agar biaya & latensi AI terkendali.
 */
export async function renderPdfPages(buf: Buffer, maxPages = 3): Promise<PdfPage[]> {
  const { pdf } = await import("pdf-to-img");
  const document = await pdf(buf, { scale: 2 });
  const pages: PdfPage[] = [];

  let index = 1;
  for await (const image of document) {
    if (index > maxPages) break;
    pages.push({ mime: "image/png", base64: image.toString("base64") });
    index++;
  }
  return pages;
}
