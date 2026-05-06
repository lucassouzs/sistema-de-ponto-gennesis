# O que fazer para o chatbot WhatsApp funcionar (API Meta)

Resumo do que **você precisa fazer** para o fluxo ficar completo usando a **WhatsApp Cloud API (Meta)**: contato no WhatsApp, conversas no sistema e envio de atestado.

---

## 1. Criar app e configurar WhatsApp no Meta for Developers

- Acesse [developers.facebook.com](https://developers.facebook.com) e crie um **App** (tipo “Business”).
- No app, adicione o produto **WhatsApp** (WhatsApp > Introdução).
- Em **WhatsApp > Configuração da API**:
  - **Número de telefone:** adicione/verifique um número (pode ser número de teste da Meta ou um número real após verificação do negócio).
  - Anote o **ID do número de telefone** (Phone Number ID) e o **Token de acesso** (Access Token). O token de teste expira em 24h; para produção use um **token permanente** (System User ou processo de aprovação da Meta).

**Resultado:** você tem `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_ACCESS_TOKEN` para o `.env`.

---

## 2. Deixar seu backend acessível pela internet (para o webhook)

A Meta precisa chamar uma **URL pública** do seu backend (HTTPS em produção).

- **Produção:** backend em servidor com HTTPS (ex.: Railway, Render, VPS).  
  - Exemplo: `https://seu-backend.com/api/whatsapp/webhook`
- **Desenvolvimento:** use **ngrok** (ou similar).  
  - Ex.: `ngrok http 5000` → URL tipo `https://xxxx.ngrok.io`.  
  - Webhook: `https://xxxx.ngrok.io/api/whatsapp/webhook`

**Resultado:** uma URL fixa para configurar no webhook do app Meta.

---

## 3. Configurar o webhook no app Meta

- No app, vá em **WhatsApp > Configuração** (ou Configurações do app > Webhooks).
- Clique em **Configurar** ou **Editar** no campo “Webhook”.
- **URL de callback:** a URL do passo 2 (ex.: `https://seu-backend.com/api/whatsapp/webhook`).
- **Token de verificação (Verify token):** um valor que **você escolhe** e que está no `.env` como `WHATSAPP_VERIFY_TOKEN` (ex.: `gennesis_whatsapp_verify`).
- Clique em **Verificar e salvar**. O backend responde ao GET com o `hub.challenge`; a Meta valida e ativa o webhook.
- Inscreva-se no objeto **whatsapp_business_account** e no campo **messages**.

**Resultado:** toda mensagem recebida no número configurado será enviada pela Meta para o seu backend nessa URL.

---

## 4. Variáveis de ambiente no backend

No `.env` do backend:

```env
WHATSAPP_PHONE_NUMBER_ID=   # ID do número de telefone (Meta)
WHATSAPP_ACCESS_TOKEN=      # Token de acesso (permanente em produção)
WHATSAPP_VERIFY_TOKEN=gennesis_whatsapp_verify   # Mesmo valor definido no Webhook (Verify token)
```

---

## 5. O que já está implementado no backend

- **GET /api/whatsapp/webhook** – Verificação do webhook pela Meta (hub.mode, hub.verify_token, hub.challenge).
- **POST /api/whatsapp/webhook** – Recebe eventos da Meta (mensagens de texto, imagem, documento etc.), extrai número e conteúdo, chama o bot.
- **Serviço do bot** – Fluxo (menu, atestado, dúvidas), gravação em `WhatsAppConversation`, `WhatsAppMessage`, `WhatsAppSubmission` e envio de resposta via **Meta WhatsApp Cloud API**.
- **Rotas autenticadas** – Listagem e detalhe de conversas em **Principal → Conversas WhatsApp**.

---

## 6. Resumo em ordem

| # | O que fazer |
|---|-------------|
| 1 | Criar app no Meta for Developers e configurar WhatsApp (número + token). |
| 2 | Expor o backend na internet (produção ou ngrok em dev). |
| 3 | Configurar webhook no app Meta (URL + Verify token) e inscrever em “messages”. |
| 4 | Preencher no `.env`: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`. |

Quando isso estiver feito, as mensagens recebidas no número configurado serão processadas pelo bot, as conversas e atestados aparecerão em **Principal → Conversas WhatsApp**, e as respostas serão enviadas pela API oficial da Meta.

Documentação oficial: [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api).
