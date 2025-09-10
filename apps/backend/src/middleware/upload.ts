import multer from 'multer';
import { Request } from 'express';

// Configuração do multer para upload de fotos
const storage = multer.memoryStorage();

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimePrefixes = ['image/'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

  const mimetypeOk = !!file.mimetype && allowedMimePrefixes.some((p) => file.mimetype.startsWith(p));
  const nameLower = (file.originalname || '').toLowerCase();
  const extensionOk = allowedExtensions.some((ext) => nameLower.endsWith(ext));

  // Aceita se o mimetype é de imagem OU se a extensão do arquivo indica imagem.
  if (mimetypeOk || extensionOk) {
    return cb(null, true);
  }

  cb(new Error('Apenas arquivos de imagem são permitidos'));
};

export const uploadPhoto = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880'), // 5MB
    files: 1 // Apenas 1 arquivo por vez
  }
});

// Middleware para capturar erros de upload
export const handleUploadError = (error: any, req: Request, res: any, next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'Arquivo muito grande. Máximo permitido: 5MB'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Muitos arquivos. Apenas 1 arquivo por vez é permitido'
      });
    }
  }
  
  if (error && error.message === 'Apenas arquivos de imagem são permitidos') {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }

  next(error);
};
