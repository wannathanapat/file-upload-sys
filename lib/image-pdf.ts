import { jsPDF } from 'jspdf';

const isBrowser = typeof window !== 'undefined';

// Load image source as HTMLImageElement
const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    if (!isBrowser) {
      reject(new Error("loadImage can only run in the browser"));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for PDF conversion"));
  });
};

// Compress image file using canvas and export as jpeg data URL
export const compressImage = (
  file: File, 
  maxWidth = 1200, 
  maxHeight = 1200, 
  quality = 0.8
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!isBrowser) {
      reject(new Error("compressImage can only run in the browser"));
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Resize logic keeping aspect ratio
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error("Cannot get canvas context for image compression"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Compress image to JPEG format with specified quality
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error("Failed to read image dimensions"));
    };
    reader.onerror = () => reject(new Error("Failed to read image file"));
  });
};

// Convert a list of image files to a single PDF Blob
export const convertImagesToPdf = async (
  images: File[], 
  onProgress?: (index: number, total: number) => void
): Promise<Blob> => {
  if (!isBrowser) {
    throw new Error("convertImagesToPdf can only run in the browser");
  }

  // Create A4 PDF in points (A4 size is 595.28 x 841.89 points)
  const pdf = new jsPDF({
    orientation: 'p',
    unit: 'pt',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < images.length; i++) {
    if (i > 0) {
      pdf.addPage();
    }

    if (onProgress) {
      onProgress(i + 1, images.length);
    }

    // 1. Compress image to data URL (JPEG, quality 0.8)
    const imgDataUrl = await compressImage(images[i]);

    // 2. Load the compressed image to get dimensions
    const img = await loadImage(imgDataUrl);
    const imgWidth = img.width;
    const imgHeight = img.height;

    // 3. Scale image to fit A4 page
    const widthRatio = pageWidth / imgWidth;
    const heightRatio = pageHeight / imgHeight;
    const ratio = Math.min(widthRatio, heightRatio);

    const w = imgWidth * ratio;
    const h = imgHeight * ratio;

    // 4. Center image on page
    const x = (pageWidth - w) / 2;
    const y = (pageHeight - h) / 2;

    // 5. Add image to PDF page
    pdf.addImage(imgDataUrl, 'JPEG', x, y, w, h);
  }

  return pdf.output('blob');
};

// Dynamically load PDFJS from CDN
const loadPdfJs = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error("loadPdfJs can only run in the browser"));
      return;
    }
    
    const win = window as any;
    if (win.pdfjsLib) {
      resolve(win.pdfjsLib);
      return;
    }
    
    // Check if script is already added to DOM to avoid duplicates
    const existingScript = document.getElementById('pdfjs-cdn-script');
    if (existingScript) {
      // Wait for it to load if it's already loading
      const checkInterval = setInterval(() => {
        if (win.pdfjsLib) {
          clearInterval(checkInterval);
          resolve(win.pdfjsLib);
        }
      }, 100);
      return;
    }

    const script = document.createElement('script');
    script.id = 'pdfjs-cdn-script';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      win.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(win.pdfjsLib);
    };
    script.onerror = () => reject(new Error('Failed to load PDF.js library from CDN'));
    document.head.appendChild(script);
  });
};

// Compress a PDF file client-side by rendering pages to canvas and recreating PDF
export const compressPdfFile = async (
  pdfFile: File,
  quality = 0.6,
  scale = 1.5,
  onProgress?: (current: number, total: number) => void
): Promise<File> => {
  if (!isBrowser) {
    throw new Error("compressPdfFile can only run in the browser");
  }

  const pdfjsLib = await loadPdfJs();
  
  const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(pdfFile);
  });

  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdfDoc.numPages;

  const pdfOut = new jsPDF({
    orientation: 'p',
    unit: 'pt',
    format: 'a4'
  });
  
  const pageWidth = pdfOut.internal.pageSize.getWidth();
  const pageHeight = pdfOut.internal.pageSize.getHeight();

  for (let i = 1; i <= numPages; i++) {
    if (i > 1) {
      pdfOut.addPage();
    }
    
    if (onProgress) {
      onProgress(i, numPages);
    }

    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context is not available');
    }

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    // Convert canvas page to compressed JPEG
    const imgDataUrl = canvas.toDataURL('image/jpeg', quality);

    // Scale to A4 page
    const wRatio = pageWidth / viewport.width;
    const hRatio = pageHeight / viewport.height;
    const ratio = Math.min(wRatio, hRatio);

    const w = viewport.width * ratio;
    const h = viewport.height * ratio;

    const x = (pageWidth - w) / 2;
    const y = (pageHeight - h) / 2;

    pdfOut.addImage(imgDataUrl, 'JPEG', x, y, w, h);
  }

  const pdfBlob = pdfOut.output('blob');
  return new File([pdfBlob], pdfFile.name, { type: 'application/pdf' });
};

