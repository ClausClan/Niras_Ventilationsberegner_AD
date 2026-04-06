// ==========================================
// PDF MANAGER (Baggrundstegninger)
// Håndterer indlæsning og parsing via pdf.js
// ==========================================

let pdfjsLibLoaded = false;

// Hjælpefunktion til at hente biblioteket dynamisk uden at rode i din index.html
function loadPdfJs() {
    return new Promise((resolve, reject) => {
        if (pdfjsLibLoaded && window['pdfjs-dist/build/pdf']) {
            resolve(window['pdfjs-dist/build/pdf']);
            return;
        }

        const script = document.createElement('script');
        // Vi bruger en stabil version fra cdnjs
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = () => {
            pdfjsLibLoaded = true;
            const pdfjsLib = window['pdfjs-dist/build/pdf'];
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            resolve(pdfjsLib);
        };
        script.onerror = () => reject(new Error('Kunne ikke indlæse pdf.js'));
        document.head.appendChild(script);
    });
}

/**
 * Læser en PDF-fil (fra et <input type="file">), renderer den første side
 * i høj opløsning på et canvas, og returnerer dette canvas.
 */
export async function renderPdfToCanvas(file) {
    try {
        const pdfjsLib = await loadPdfJs();
        const arrayBuffer = await file.arrayBuffer();
        
        // Åbn PDF-dokumentet
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        // Hent første side (plantegninger er oftest side 1)
        const page = await pdfDoc.getPage(1);
        
        // Vi opskalerer tegningen markant (scale 3.0) for at sikre 
        // at arkitektens fine linjer bliver skarpe i 3D
        const scale = 3.0; 
        const viewport = page.getViewport({ scale: scale });

        // Opret et usynligt canvas til at tegne PDF'en på
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // Sørg for at canvas matcher viewport præcist
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        
        // Render siden til canvas
        await page.render(renderContext).promise;
        
        console.log(`[PDF Manager] Arkitekttegning renderet. Opløsning: ${canvas.width}x${canvas.height}`);
        
        return canvas;
        
    } catch (error) {
        console.error('[PDF Manager] Fejl ved rendering:', error);
        throw error;
    }
}