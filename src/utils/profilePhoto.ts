/**
 * Utilitários seguros para foto 3x4 de perfil do usuário.
 * - Valida URLs de imagem (bloqueando SVG, javascript:, data:text/html etc.)
 * - Recorta e redimensiona automaticamente para proporção 3x4 (300x400px) em JPEG otimizado.
 */

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_INPUT_FILE_BYTES = 10 * 1024 * 1024; // 10 MB arquivo original antes do redimensionamento
const TARGET_WIDTH = 300;
const TARGET_HEIGHT = 400; // Proporção exata 3:4

export function getSafeProfilePhotoUrl(url?: string | null): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(raw)) {
    return raw;
  }
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href;
    }
  } catch {
    return null;
  }
  return null;
}

export function cropImageFileTo3x4DataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('Nenhum arquivo selecionado.'));
      return;
    }
    if (!ALLOWED_IMAGE_MIMES.has(file.type.toLowerCase())) {
      reject(new Error('Formato inválido. Envie uma imagem JPG, PNG ou WEBP.'));
      return;
    }
    if (file.size > MAX_INPUT_FILE_BYTES) {
      reject(new Error('A imagem selecionada excede o limite de 10 MB.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo de imagem.'));
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        reject(new Error('Falha ao processar a imagem.'));
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error('O arquivo selecionado não é uma imagem válida.'));
      img.onload = () => {
        try {
          const srcW = img.naturalWidth || img.width;
          const srcH = img.naturalHeight || img.height;
          if (!srcW || !srcH) {
            reject(new Error('Dimensões da imagem inválidas.'));
            return;
          }

          // Recorte centralizado na proporção exata 3x4 (com leve prioridade para o topo em retratos)
          const targetRatio = TARGET_WIDTH / TARGET_HEIGHT; // 0.75
          const srcRatio = srcW / srcH;

          let cropW = srcW;
          let cropH = srcH;
          let sx = 0;
          let sy = 0;

          if (srcRatio > targetRatio) {
            // Imagem mais larga que 3:4 -> corta nas laterais igualmente
            cropW = srcH * targetRatio;
            sx = (srcW - cropW) / 2;
          } else {
            // Imagem mais alta que 3:4 -> corta altura com foco leve no terço superior (rosto)
            cropH = srcW / targetRatio;
            sy = Math.max(0, (srcH - cropH) * 0.25);
          }

          const canvas = document.createElement('canvas');
          canvas.width = TARGET_WIDTH;
          canvas.height = TARGET_HEIGHT;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Não foi possível inicializar o processamento da imagem.'));
            return;
          }

          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);

          const outDataUrl = canvas.toDataURL('image/jpeg', 0.86);
          if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/i.test(outDataUrl)) {
            reject(new Error('Falha ao gerar a foto 3x4.'));
            return;
          }
          resolve(outDataUrl);
        } catch {
          reject(new Error('Erro ao recortar a foto para o formato 3x4.'));
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
