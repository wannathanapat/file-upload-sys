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
