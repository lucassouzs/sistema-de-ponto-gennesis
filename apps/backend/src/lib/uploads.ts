import path from 'path';

/**
 * Pasta `apps/backend/uploads` — não usar process.cwd() (varia conforme o script/npm).
 * Deve ser o mesmo caminho usado em express.static('/uploads').
 */
export const backendUploadsRoot = path.resolve(__dirname, '..', '..', 'uploads');
