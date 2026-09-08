import dotenv from 'dotenv';
import path from 'path';

/**
 * Deve ser o primeiro import do index.ts.
 * Com tsx/ESM, imports são hoisted — dotenv.config() no meio do index
 * roda tarde demais para módulos como prisma.ts.
 */
dotenv.config({ path: path.join(__dirname, '../.env') });
