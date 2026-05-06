/**
 * Script para obter Access Token e Token Secret do Fluig via OAuth 1.0a
 *
 * Uso: npx ts-node scripts/get-fluig-tokens.ts
 *
 * Certifique-se de que o .env tem:
 *   FLUIG_BASE_URL
 *   FLUIG_CONSUMER_KEY
 *   FLUIG_CONSUMER_SECRET
 */

import 'dotenv/config';
import * as crypto from 'crypto';
import * as readline from 'readline';
import OAuth from 'oauth-1.0a';
import axios from 'axios';

const BASE = process.env.FLUIG_BASE_URL?.replace(/\/$/, '') || 'https://gennesisengenharia160516.fluig.cloudtotvs.com.br';
const CONSUMER_KEY = process.env.FLUIG_CONSUMER_KEY || 'PowerBI';
const CONSUMER_SECRET = process.env.FLUIG_CONSUMER_SECRET || 'PowerBI';

const REQUEST_TOKEN_URL = `${BASE}/portal/api/rest/oauth/request_token`;
const AUTHORIZE_URL = `${BASE}/portal/api/rest/oauth/authorize`;
const ACCESS_TOKEN_URL = `${BASE}/portal/api/rest/oauth/access_token`;

function parseOAuthResponse(body: string): Record<string, string> {
  const params: Record<string, string> = {};
  const str = typeof body === 'string' ? body : JSON.stringify(body);
  const clean = str.replace(/^.*\?/, '');
  for (const pair of clean.split('&')) {
    const eq = pair.indexOf('=');
    if (eq > 0) {
      const key = decodeURIComponent(pair.slice(0, eq));
      const val = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
      params[key] = val;
    }
  }
  return params;
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve((answer || '').trim());
    });
  });
}

async function main() {
  console.log('\n=== Obter tokens OAuth do Fluig ===\n');
  console.log('Base URL:', BASE);
  console.log('Consumer Key:', CONSUMER_KEY);
  console.log('');

  const oauth = OAuth({
    consumer: { key: CONSUMER_KEY, secret: CONSUMER_SECRET },
    signature_method: 'HMAC-SHA1',
    hash_function: (base: string, key: string) =>
      crypto.createHmac('sha1', key).update(base).digest('base64'),
  });

  // 1. Request Token
  console.log('1. Obtendo Request Token...');
  const reqTokenData = { url: REQUEST_TOKEN_URL, method: 'GET' };
  const reqTokenAuth = oauth.authorize(reqTokenData);

  let res1: string;
  try {
    const r = await axios.get(REQUEST_TOKEN_URL, {
      headers: oauth.toHeader(reqTokenAuth) as Record<string, string>,
      validateStatus: () => true,
    });
    res1 = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error('Erro ao obter request token:', err.message);
    process.exit(1);
  }

  const token1 = parseOAuthResponse(res1);
  const oauthToken = token1.oauth_token;
  const oauthTokenSecret = token1.oauth_token_secret;

  if (!oauthToken || !oauthTokenSecret) {
    console.error('Resposta inesperada. Verifique Consumer Key e Consumer Secret.');
    console.error('Resposta:', res1);
    process.exit(1);
  }

  console.log('   OK\n');

  // 2. Autorização
  const authUrl = `${AUTHORIZE_URL}?oauth_token=${encodeURIComponent(oauthToken)}`;
  console.log('2. Abra esta URL no navegador e autorize:\n');
  console.log('   ' + authUrl + '\n');
  console.log('3. Após autorizar, o Fluig vai redirecionar.');
  console.log('   Copie o parâmetro oauth_verifier da URL de destino');
  console.log('   (ex: se a URL terminar com ?oauth_verifier=ABC123, use ABC123)\n');

  const oauthVerifier = await prompt('Cole o oauth_verifier aqui: ');
  if (!oauthVerifier) {
    console.error('oauth_verifier é obrigatório.');
    process.exit(1);
  }

  // 4. Access Token
  console.log('\n4. Trocando por Access Token...');
  const accessData = {
    url: ACCESS_TOKEN_URL,
    method: 'GET',
    data: { oauth_verifier: oauthVerifier },
  };
  const accessAuth = oauth.authorize(accessData, {
    key: oauthToken,
    secret: oauthTokenSecret,
  });

  const accessTokenUrl = `${ACCESS_TOKEN_URL}?oauth_token=${encodeURIComponent(accessAuth.oauth_token || oauthToken)}&oauth_verifier=${encodeURIComponent(oauthVerifier)}`;

  let res2: string;
  try {
    const r = await axios.get(accessTokenUrl, {
      headers: oauth.toHeader(accessAuth) as Record<string, string>,
      validateStatus: () => true,
    });
    res2 = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
  } catch (e: unknown) {
    const err = e as { message?: string; response?: { data?: unknown } };
    console.error('Erro ao obter access token:', err.message);
    if (err.response?.data) console.error('Resposta:', err.response.data);
    process.exit(1);
  }

  const token2 = parseOAuthResponse(res2);
  const accessToken = token2.oauth_token;
  const accessTokenSecret = token2.oauth_token_secret;

  if (!accessToken || !accessTokenSecret) {
    console.error('Resposta inesperada:', res2);
    process.exit(1);
  }

  console.log('   OK - Tokens obtidos!\n');
  console.log('========================================');
  console.log('Adicione ao seu .env:\n');
  console.log(`FLUIG_ACCESS_TOKEN=${accessToken}`);
  console.log(`FLUIG_ACCESS_TOKEN_SECRET=${accessTokenSecret}`);
  console.log('========================================\n');
  process.exit(0);
}

main();
