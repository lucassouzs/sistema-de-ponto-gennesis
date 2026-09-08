/**
 * Hash/compare de senha com bcrypt nativo quando disponível,
 * fallback automático para bcryptjs (build Linux/Railway sem binário nativo).
 *
 * Hashes gerados por bcrypt e bcryptjs são interoperáveis (mesmo formato $2a$/$2b$).
 */
import bcryptjs from 'bcryptjs';

export const BCRYPT_ROUNDS = 12;

type BcryptLike = {
  hash(data: string | Buffer, rounds: number): Promise<string>;
  compare(data: string | Buffer, encrypted: string): Promise<boolean>;
};

let impl: BcryptLike = bcryptjs;
let implName: 'bcrypt' | 'bcryptjs' = 'bcryptjs';

try {
  // require dinâmico: se o binário nativo falhar no load, caímos no JS puro
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const native = require('bcrypt') as BcryptLike;
  if (typeof native?.hash === 'function' && typeof native?.compare === 'function') {
    impl = native;
    implName = 'bcrypt';
  }
} catch {
  // Mantém bcryptjs
}

export function getPasswordHashImplementation(): 'bcrypt' | 'bcryptjs' {
  return implName;
}

export async function hashPassword(
  password: string,
  rounds: number = BCRYPT_ROUNDS,
): Promise<string> {
  return impl.hash(password, rounds);
}

export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return impl.compare(password, hash);
}
