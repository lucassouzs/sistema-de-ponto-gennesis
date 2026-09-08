import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { APP_NAME } from '../lib/appBranding';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private resend: Resend | null = null;
  private useResend: boolean = false;

  constructor() {
    // Priorizar Resend se a API key estiver configurada (mais confiável em plataformas como Railway)
    const resendApiKey = process.env.RESEND_API_KEY;
    
    if (resendApiKey) {
      this.resend = new Resend(resendApiKey);
      this.useResend = true;
      console.log('✅ Configuração Resend detectada - usando Resend para envio de emails');
      return;
    }

    // Fallback para SMTP se Resend não estiver configurado
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (smtpHost && smtpPort && smtpUser && smtpPass) {
      const port = parseInt(smtpPort);
      const isSecure = port === 465;
      
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: port,
        secure: isSecure, // true para 465, false para outras portas
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        // Configurações de timeout e conexão
        connectionTimeout: 20000, // 20 segundos para conectar
        greetingTimeout: 20000, // 20 segundos para greeting
        socketTimeout: 20000, // 20 segundos para socket
        // Configurações TLS/SSL
        tls: {
          rejectUnauthorized: false,
          minVersion: 'TLSv1.2'
        },
        // Para portas não-seguras, usar STARTTLS
        requireTLS: !isSecure && port === 587
      } as any);
      
      // Testar conexão ao inicializar (com timeout)
      const verifyPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout ao verificar conexão SMTP'));
        }, 15000); // 15 segundos para verificação
        
        this.transporter!.verify((error, success) => {
          clearTimeout(timeout);
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      
      verifyPromise
        .then(() => {
          console.log('✅ Configuração SMTP válida');
        })
        .catch((error: any) => {
          console.error('❌ Erro na configuração SMTP:', error.message);
          if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
            console.error('⏱️ Timeout ao conectar ao servidor SMTP:');
            console.error('   - O Railway pode estar bloqueando conexões SMTP de saída');
            console.error('   - Tente usar um serviço de email alternativo (SendGrid, Mailgun, etc.)');
            console.error('   - Ou verifique se o Gmail está bloqueando conexões do Railway');
          } else if (error.message.includes('Invalid login') || error.message.includes('BadCredentials')) {
            console.error('📧 Para Gmail, você precisa usar uma SENHA DE APP:');
            console.error('   1. Acesse: https://myaccount.google.com/apppasswords');
            console.error('   2. Gere uma senha de app para "Mail"');
            console.error('   3. Use essa senha no SMTP_PASS (não use a senha normal da conta)');
            console.error('   4. Certifique-se de que a autenticação de 2 fatores está habilitada');
          }
        });
    } else {
      const missingVars = [];
      if (!smtpHost) missingVars.push('SMTP_HOST');
      if (!smtpPort) missingVars.push('SMTP_PORT');
      if (!smtpUser) missingVars.push('SMTP_USER');
      if (!smtpPass) missingVars.push('SMTP_PASS');
      
      console.error('⚠️ Configurações de SMTP não encontradas. Emails não serão enviados.');
      console.error(`Variáveis faltando: ${missingVars.join(', ')}`);
      console.error('Configure essas variáveis de ambiente para habilitar o envio de emails.');
      
      if (process.env.NODE_ENV === 'production') {
        console.error('🚨 ATENÇÃO: Você está em PRODUÇÃO e o serviço de email não está configurado!');
        console.error('Isso afetará funcionalidades como recuperação de senha.');
        console.error('');
        console.error('💡 SOLUÇÃO RECOMENDADA: Use Resend (gratuito até 3.000 emails/mês)');
        console.error('   1. Crie uma conta em: https://resend.com');
        console.error('   2. Obtenha sua API Key');
        console.error('   3. Configure a variável: RESEND_API_KEY=sua_api_key');
        console.error('   4. Configure o domínio de email verificado no Resend');
      }
    }
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    // Usar Resend se estiver configurado
    if (this.useResend && this.resend) {
      try {
        const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.SMTP_USER || 'noreply@gennesis.com';
        const fromName = process.env.COMPANY_NAME || 'Gennesis Engenharia';
        
        const { data, error } = await this.resend.emails.send({
          from: `${fromName} <${fromEmail}>`,
          to: options.to,
          subject: options.subject,
          html: options.html,
        });

        if (error) {
          console.error('❌ Erro ao enviar email via Resend:', error);
          throw new Error(`Erro ao enviar email: ${error.message}`);
        }

        console.log('✅ Email enviado com sucesso via Resend:', data?.id);
        return;
      } catch (error: any) {
        console.error('❌ Erro ao enviar email via Resend:', error);
        throw error;
      }
    }

    // Fallback para SMTP
    if (!this.transporter) {
      const errorMsg = '⚠️ Serviço de email não configurado. Email não enviado.';
      console.error(errorMsg);
      console.error('📧 Email que seria enviado:');
      console.error('Para:', options.to);
      console.error('Assunto:', options.subject);
      console.error('');
      console.error('💡 Configure uma das opções:');
      console.error('   Opção 1 (RECOMENDADO): RESEND_API_KEY=sua_api_key');
      console.error('   Opção 2: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS');
      
      // Em desenvolvimento, apenas logar o email que seria enviado
      if (process.env.NODE_ENV === 'development') {
        console.log('📧 Email que seria enviado:');
        console.log('Para:', options.to);
        console.log('Assunto:', options.subject);
        console.log('Conteúdo:', options.text || options.html);
      }
      
      // Lançar erro para que seja capturado e logado no controller
      throw new Error('Serviço de email não configurado. Configure RESEND_API_KEY ou variáveis SMTP.');
    }

    try {
      const mailOptions = {
        from: `"${process.env.COMPANY_NAME || 'Gennesis Engenharia'}" <${process.env.SMTP_USER}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ''), // Remover HTML para versão texto
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email enviado com sucesso via SMTP:', info.messageId);
    } catch (error: any) {
      console.error('❌ Erro ao enviar email via SMTP:', error);
      
      // Mensagens de erro mais amigáveis
      if (error.code === 'EAUTH') {
        console.error('🔐 Erro de autenticação SMTP:');
        console.error('   - Verifique se está usando uma SENHA DE APP do Gmail (não a senha normal)');
        console.error('   - Para Gmail: https://myaccount.google.com/apppasswords');
        console.error('   - Certifique-se de que a autenticação de 2 fatores está habilitada');
      } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
        console.error('🌐 Erro de conexão/timeout SMTP:');
        console.error('   - O Railway pode estar bloqueando conexões SMTP de saída');
        console.error('   - 💡 RECOMENDAÇÃO: Use Resend (RESEND_API_KEY) em vez de SMTP');
        console.error('   - Resend é gratuito até 3.000 emails/mês: https://resend.com');
      }
      
      throw error;
    }
  }

  async sendPasswordResetEmail(email: string, name: string, resetToken: string, resetUrl: string): Promise<void> {
    const subject = `Redefinição de Senha - ${APP_NAME}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Redefinição de Senha</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h1 style="color: #dc2626; margin-top: 0;">Redefinição de Senha</h1>
          <p>Olá, <strong>${name}</strong>!</p>
          <p>Recebemos uma solicitação para redefinir a senha da sua conta no ${APP_NAME}.</p>
          <p>Para redefinir sua senha, clique no botão abaixo:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Redefinir Senha</a>
          </div>
          <p>Ou copie e cole o link abaixo no seu navegador:</p>
          <p style="background-color: #e5e7eb; padding: 10px; border-radius: 5px; word-break: break-all; font-size: 12px;">${resetUrl}</p>
          <p><strong>Este link expira em 1 hora.</strong></p>
          <p>Se você não solicitou a redefinição de senha, ignore este email. Sua senha permanecerá inalterada.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="font-size: 12px; color: #6b7280; margin: 0;">
            Este é um email automático, por favor não responda.<br>
            ${APP_NAME} — Gennesis Engenharia
          </p>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject,
      html,
    });
  }
}

export const emailService = new EmailService();

