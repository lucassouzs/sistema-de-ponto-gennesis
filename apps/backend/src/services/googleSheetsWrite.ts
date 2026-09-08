import jwt from 'jsonwebtoken';

type AppendSheetRowInput = {
  spreadsheetId: string;
  sheetName: string;
  values: string[];
};

function serviceAccountEmail(): string | null {
  return (
    process.env.BANCO_CATS_GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ||
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ||
    null
  );
}

function serviceAccountPrivateKey(): string | null {
  const raw =
    process.env.BANCO_CATS_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim() ||
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim() ||
    '';
  if (!raw) return null;
  return raw.replace(/\\n/g, '\n');
}

function webhookUrl(): string | null {
  return (
    process.env.BANCO_CATS_WEBHOOK_URL?.trim() ||
    process.env.BANCO_CATS_APPS_SCRIPT_URL?.trim() ||
    null
  );
}

function webhookSecret(): string | null {
  return process.env.BANCO_CATS_WEBHOOK_SECRET?.trim() || null;
}

export function isGoogleSheetsWriteConfigured(): boolean {
  const hasServiceAccount = Boolean(serviceAccountEmail() && serviceAccountPrivateKey());
  const hasWebhook = Boolean(webhookUrl());
  return hasServiceAccount || hasWebhook;
}

export function googleSheetsWriteConfigError(): string {
  return (
    'Gravação na planilha não configurada. Defina BANCO_CATS_WEBHOOK_URL ' +
    '(Apps Script) ou GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ' +
    'e compartilhe a planilha com a conta de serviço como editor.'
  );
}

async function getServiceAccountAccessToken(): Promise<string> {
  const email = serviceAccountEmail();
  const privateKey = serviceAccountPrivateKey();
  if (!email || !privateKey) {
    throw new Error('Credenciais da conta de serviço Google ausentes.');
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    privateKey,
    { algorithm: 'RS256' }
  );

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const payload = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        `Falha ao autenticar na Google Sheets API (${response.status}).`
    );
  }

  return payload.access_token;
}

async function appendViaServiceAccount(input: AppendSheetRowInput): Promise<void> {
  const accessToken = await getServiceAccountAccessToken();
  const range = encodeURIComponent(`${input.sheetName}!A:Z`);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${input.spreadsheetId}/values/${range}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      majorDimension: 'ROWS',
      values: [input.values],
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(
      payload?.error?.message ||
        `Falha ao gravar na planilha Google (${response.status}).`
    );
  }
}

async function appendViaWebhook(input: AppendSheetRowInput): Promise<void> {
  const url = webhookUrl();
  if (!url) {
    throw new Error('Webhook do Apps Script não configurado.');
  }

  const body = {
    action: 'append',
    secret: webhookSecret() ?? undefined,
    spreadsheetId: input.spreadsheetId,
    sheetName: input.sheetName,
    values: input.values,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow',
  });

  const text = await response.text();
  type WebhookResponse = {
    ok?: boolean;
    success?: boolean;
    error?: string;
    message?: string;
  };
  let payload: WebhookResponse | null = null;
  try {
    payload = JSON.parse(text) as WebhookResponse;
  } catch {
    // Apps Script às vezes devolve HTML em falhas de deploy
  }

  if (!response.ok) {
    throw new Error(
      payload?.error ||
        payload?.message ||
        `Webhook da planilha retornou status ${response.status}.`
    );
  }

  if (payload && payload.ok === false) {
    throw new Error(payload.error || payload.message || 'Webhook recusou a gravação.');
  }

  if (payload && payload.success === false) {
    throw new Error(payload.error || payload.message || 'Webhook recusou a gravação.');
  }
}

export async function appendGoogleSheetRow(input: AppendSheetRowInput): Promise<'service_account' | 'webhook'> {
  if (serviceAccountEmail() && serviceAccountPrivateKey()) {
    await appendViaServiceAccount(input);
    return 'service_account';
  }

  if (webhookUrl()) {
    await appendViaWebhook(input);
    return 'webhook';
  }

  throw new Error(googleSheetsWriteConfigError());
}
