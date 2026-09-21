/**
 * Konversi halaman PDF menjadi gambar PNG di sisi browser (Client-Side).
 * Ini memastikan rendering PDF 100% andal di semua platform (termasuk Vercel Serverless)
 * tanpa memerlukan dependensi binary C++ canvas di server.
 */

export async function convertPdfToImageFile(file: File): Promise<File> {
  // Hanya proses jika file memang PDF
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return file;
  }

  try {
    // Muat pdfjs secara dinamis di client
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    // Gunakan worker yang cocok dengan versi pdfjs-dist
    const version = pdfjsLib.version || "4.10.38";
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/legacy/build/pdf.worker.min.mjs`;

    const buffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: buffer,
      cMapPacked: true,
    });

    const pdfDoc = await loadingTask.promise;
    if (pdfDoc.numPages === 0) return file;

    // Ambil halaman pertama
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 }); // Skala 2x agar teks tajam untuk OCR AI

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    // Render halaman ke canvas (kompatibel dengan berbagai versi pdfjs RenderParameters)
    const renderParams = {
      canvasContext: ctx,
      canvas: canvas,
      viewport,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (page.render as (params: any) => { promise: Promise<void> })(renderParams).promise;

    // Konversi canvas ke PNG Blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/png", 0.95);
    });

    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.png`, { type: "image/png" });
  } catch (err) {
    console.warn("Client-side PDF render fallback to original file:", err);
    return file;
  }
}
