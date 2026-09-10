/**
 * Vertical offset (in PDF points) for each page's `addImage` call when
 * slicing one tall rendered image across multiple same-size PDF pages —
 * page 1 always starts at 0; each following page's offset is negative,
 * shifting the same image up by one more `pageHeight` so the next unseen
 * slice lands in view. Always returns at least one offset, even when the
 * image is shorter than a single page.
 *
 * Pulled out of htmlToPdfBlob (below) as the one piece of that function
 * that's pure arithmetic rather than DOM/canvas rendering — the rest can't
 * run outside a real browser, but an off-by-one here would silently drop or
 * duplicate content on every generated PDF, so it's worth pinning down.
 */
export function computePdfPageOffsets(imgHeight: number, pageHeight: number): number[] {
    const offsets: number[] = [0];
    let heightLeft = imgHeight - pageHeight;
    while (heightLeft > 0) {
        offsets.push(heightLeft - imgHeight);
        heightLeft -= pageHeight;
    }
    return offsets;
}

/** Renders a fragment of print-ready HTML (as produced by the tenant-data
 *  document generators) into an actual PDF file, off-screen, using the same
 *  html2canvas + jsPDF page-slicing recipe the ecosystem generally uses for
 *  "screenshot this DOM node into a multi-page PDF". Runs client-side only. */
export async function htmlToPdfBlob(bodyHtml: string): Promise<Blob> {
    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
    ]);

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-10000px';
    container.style.top = '0';
    container.style.width = '700px';
    container.style.background = '#ffffff';
    container.style.padding = '48px';
    container.style.fontFamily = 'Arial, Helvetica, sans-serif';
    container.style.color = '#101828';
    container.style.lineHeight = '1.6';
    container.innerHTML = bodyHtml;
    document.body.appendChild(container);

    try {
        const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff' });

        // A fresh jsPDF document per attempt — reusing one across retries
        // would just keep appending pages to what's already there instead of
        // re-rendering at the new quality.
        const render = (quality: number): Blob => {
            // JPEG instead of PNG: a lossless PNG of a multi-page raster
            // screenshot routinely lands in the tens of MB for a
            // normal-length document and blows past the storage bucket's
            // upload size limit; JPEG is a fraction of that with no visible
            // loss on a white-background text/table document like these.
            const imgData = canvas.toDataURL('image/jpeg', quality);
            const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const imgWidth = pageWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            computePdfPageOffsets(imgHeight, pageHeight).forEach((position, index) => {
                if (index > 0) pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            });
            return pdf.output('blob');
        };

        // A generous but real bucket limit backs this upload — if the
        // content is unusually long (many cost items, several pages),
        // progressively lower the JPEG quality rather than let a single
        // fixed setting risk a 413 on larger documents.
        const MAX_BYTES = 9 * 1024 * 1024;
        for (const quality of [0.92, 0.8, 0.65, 0.5]) {
            const blob = render(quality);
            if (blob.size <= MAX_BYTES) return blob;
        }
        return render(0.35);
    } finally {
        document.body.removeChild(container);
    }
}
