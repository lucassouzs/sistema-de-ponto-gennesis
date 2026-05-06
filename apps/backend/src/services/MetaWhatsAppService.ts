/**
 * Serviço para enviar mensagens via WhatsApp Cloud API (Meta)
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
import axios from 'axios';
import * as path from 'path';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

export class MetaWhatsAppService {
  private phoneNumberId: string;
  private accessToken: string;
  private s3: AWS.S3 | null;
  private bucketName: string;
  private useS3: boolean;

  constructor() {
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
    this.useS3 =
      !!process.env.AWS_ACCESS_KEY_ID &&
      !!process.env.AWS_SECRET_ACCESS_KEY &&
      (process.env.STORAGE_PROVIDER || '').toLowerCase() !== 'local';
    this.s3 = this.useS3
      ? new AWS.S3({
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          region: process.env.AWS_REGION || 'us-east-1'
        })
      : null;
    this.bucketName = process.env.AWS_S3_BUCKET || 'sistema-ponto-fotos';
  }

  isConfigured(): boolean {
    return !!this.phoneNumberId && !!this.accessToken;
  }

  /**
   * Normaliza o número para o formato esperado pela API (apenas dígitos, com DDI).
   */
  private normalizePhone(phone: string): string {
    let number = String(phone)
      .replace(/@s\.whatsapp\.net$/i, '')
      .replace(/@c\.us$/i, '')
      .replace(/\D/g, '');
    if (!number.startsWith('55') && number.length <= 11) {
      number = '55' + number;
    }
    return number;
  }

  /**
   * Faz POST genérico para o endpoint /messages.
   */
  private async sendMessage(phone: string, payload: Record<string, unknown>): Promise<boolean> {
    if (!this.isConfigured()) {
      console.warn(
        '[MetaWhatsApp] Não configurado. Configure WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_ACCESS_TOKEN.'
      );
      return false;
    }

    const to = this.normalizePhone(phone);
    const url = `${GRAPH_API_BASE}/${this.phoneNumberId}/messages`;

    try {
      const response = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          to,
          ...payload
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.accessToken}`
          },
          timeout: 15000
        }
      );

      return response.status >= 200 && response.status < 300;
    } catch (err: unknown) {
      const ax = err as {
        response?: { status?: number; data?: unknown };
        message?: string;
      };
      const msg = ax?.message || String(err);
      const status = ax?.response?.status;
      const data = ax?.response?.data;
      console.error(
        '[MetaWhatsApp] Erro ao enviar:',
        msg,
        status ? `status=${status}` : '',
        data ? JSON.stringify(data).slice(0, 300) : ''
      );
      return false;
    }
  }

  /**
   * Envia mensagem de texto via WhatsApp Cloud API.
   */
  async sendText(phone: string, text: string): Promise<boolean> {
    return this.sendMessage(phone, {
      type: 'text',
      text: { body: text }
    });
  }

  /**
   * Envia botões de resposta (máx. 3).
   */
  async sendButtons(
    phone: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>
  ): Promise<boolean> {
    const actionButtons = buttons.slice(0, 3).map((b) => ({
      type: 'reply',
      reply: { id: b.id, title: b.title.slice(0, 20) }
    }));

    return this.sendMessage(phone, {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: { buttons: actionButtons }
      }
    });
  }

  /**
   * Baixa mídia da API do WhatsApp e salva no S3 (ou local se S3 não configurado).
   * Retorna fileUrl, fileName e fileKey (para S3) ou null em caso de erro.
   */
  async downloadAndSaveMedia(
    mediaId: string,
    conversationId: string,
    mimeType?: string,
    originalFilename?: string
  ): Promise<{ fileUrl: string; fileName: string; fileKey?: string } | null> {
    if (!this.accessToken) return null;

    try {
      const infoRes = await axios.get<{ url: string }>(`${GRAPH_API_BASE}/${mediaId}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        timeout: 10000
      });
      const downloadUrl = infoRes.data?.url;
      if (!downloadUrl) return null;

      const fileRes = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        headers: { Authorization: `Bearer ${this.accessToken}` },
        timeout: 30000
      });
      const buffer = Buffer.from(fileRes.data);

      const ext = this.getExtensionFromMime(mimeType) || path.extname(originalFilename || '') || '.bin';
      const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
      const uniqueName = `${conversationId}-${Date.now()}-${uuidv4().slice(0, 8)}${safeExt}`;

      if (this.useS3 && this.s3) {
        const key = `whatsapp-media/${uniqueName}`;
        const uploadParams = {
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: mimeType || 'application/octet-stream',
          ACL: 'private' as const,
          Metadata: {
            conversationId,
            source: 'whatsapp'
          }
        };

        await this.s3.upload(uploadParams).promise();

        return {
          fileUrl: '', // Gerado sob demanda em getConversation
          fileName: originalFilename || uniqueName,
          fileKey: key
        };
      }

      // Fallback: salvar localmente
      const fs = await import('fs');
      const uploadsDir = path.join(process.cwd(), 'apps', 'backend', 'uploads', 'whatsapp-media');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const filePath = path.join(uploadsDir, uniqueName);
      fs.writeFileSync(filePath, buffer);

      const baseUrl = (process.env.API_BASE_URL || process.env.API_URL?.replace(/\/api\/?$/, '') || '').trim();
      const fileUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/uploads/whatsapp-media/${uniqueName}` : `/uploads/whatsapp-media/${uniqueName}`;

      return {
        fileUrl,
        fileName: originalFilename || uniqueName
      };
    } catch (err) {
      console.error('[MetaWhatsApp] Erro ao baixar/salvar mídia:', err);
      return null;
    }
  }

  /** Gera URL assinada para arquivo no S3 (válida por 7 dias) */
  async getSignedUrlForMedia(key: string): Promise<string | null> {
    if (!this.useS3 || !this.s3) return null;
    try {
      return await this.s3.getSignedUrlPromise('getObject', {
        Bucket: this.bucketName,
        Key: key,
        Expires: 60 * 60 * 24 * 7 // 7 dias
      });
    } catch {
      return null;
    }
  }

  private getExtensionFromMime(mime?: string): string | null {
    if (!mime) return null;
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'application/pdf': '.pdf'
    };
    return map[mime.toLowerCase()] ?? null;
  }

  /**
   * Envia lista interativa (aceita múltiplas seções, até 10 seções × 10 linhas).
   */
  async sendList(
    phone: string,
    bodyText: string,
    buttonText: string,
    sections: Array<{ title: string; rows: Array<{ id: string; title: string }> }>
  ): Promise<boolean> {
    const apiSections = sections.map((sec) => ({
      title: sec.title.slice(0, 24),
      rows: sec.rows.map((r) => ({ id: r.id, title: r.title.slice(0, 24) }))
    }));

    return this.sendMessage(phone, {
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: {
          button: buttonText.slice(0, 20),
          sections: apiSections
        }
      }
    });
  }
}

export const metaWhatsApp = new MetaWhatsAppService();
