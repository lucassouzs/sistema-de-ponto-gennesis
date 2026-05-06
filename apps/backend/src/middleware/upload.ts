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
    files: 1, // Apenas 1 arquivo por vez
    fieldSize: parseInt(process.env.MAX_FIELD_SIZE || String(5 * 1024 * 1024)) // tamanho máximo para campos (5MB por padrão)
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

// Configuração do multer para upload de planilhas (Excel e CSV)
const fileFilterImport = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/csv',
    'text/plain'
  ];
  const allowedExtensions = ['.xlsx', '.xls', '.csv'];

  const mimetypeOk = !!file.mimetype && allowedMimeTypes.includes(file.mimetype);
  const nameLower = (file.originalname || '').toLowerCase();
  const extensionOk = allowedExtensions.some((ext) => nameLower.endsWith(ext));

  if (mimetypeOk || extensionOk) {
    return cb(null, true);
  }

  cb(new Error('Apenas arquivos Excel (.xlsx, .xls) ou CSV (.csv) são permitidos'));
};

export const uploadImport = multer({
  storage,
  fileFilter: fileFilterImport,
  limits: {
    fileSize: parseInt(process.env.MAX_IMPORT_FILE_SIZE || '10485760'), // 10MB
    files: 1,
    fieldSize: parseInt(process.env.MAX_FIELD_SIZE || String(20 * 1024 * 1024)) // permitir campos maiores (20MB por padrão) para JSON 'matrix'
  }
});