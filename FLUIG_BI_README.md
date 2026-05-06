# BI Fluig - Configuração

O dashboard BI consome dados dos datasets do Fluig via API REST com OAuth 1.0a ou Bearer token.

## Variáveis de ambiente (backend)

Adicione no arquivo `.env` do backend:

```env
# Fluig API
FLUIG_BASE_URL=https://gennesisengenharia160516.fluig.cloudtotvs.com.br
FLUIG_API_PATH=/portal/api/rest
FLUIG_DATASET_API_PATH=   # opcional: path diferente para datasets (ex: /api/public/2.0)
FLUIG_CONSUMER_KEY=sua_consumer_key
FLUIG_CONSUMER_SECRET=seu_consumer_secret
FLUIG_ACCESS_TOKEN=seu_access_token
FLUIG_ACCESS_TOKEN_SECRET=seu_access_token_secret
# Ou use Bearer token (prioridade sobre OAuth 1.0 se definido):
# FLUIG_BEARER_TOKEN=eyJraWQiOi...
```

## Onde obter as chaves OAuth

1. Acesse o Fluig como administrador
2. Vá em **Painel de Controle** > **Parâmetros Técnicos** > **OAuth Provider**
3. Cadastre um OAuth App com Consumer Key e Consumer Secret
4. Autentique com um usuário/senha para obter Access Token e Token Secret

## Obter Access Token e Token Secret (script)

Se o Fluig não mostrar esses valores na tela de OAuth App, use:

```bash
cd apps/backend
npm run fluig:get-tokens
```

O script vai:
1. Obter um request token
2. Mostrar uma URL para abrir no navegador
3. Você autoriza o app no Fluig
4. Após autorizar, copie o `oauth_verifier` da URL de redirecionamento e cole no terminal
5. O script retorna `FLUIG_ACCESS_TOKEN` e `FLUIG_ACCESS_TOKEN_SECRET` para colar no `.env`

**Alternativa:** No Fluig, selecione o OAuth App > **Usuário Aplicativo** > **Create Token** — isso pode gerar e exibir os tokens diretamente.

## Uso

- Acesse **BI Fluig** no menu Principal (ao lado de Dashboard e Assistente Virtual)
- O dataset **ConsultaFilial** é carregado por padrão
- Use o seletor para trocar de dataset (se houver outros disponíveis)
- Clique em **Atualizar** para recarregar os dados

## Troubleshooting

### `javax.ws.rs.NotFoundException` ou status 500 em datasets

O path da API de datasets pode variar entre instalações. O sistema tenta automaticamente o path alternativo (`/api/public/2.0` ou `/portal/api/rest`) quando recebe NotFound.

1. **Path específico para datasets** – Se o Power BI ou outro cliente usa um path diferente, defina:
   ```env
   FLUIG_DATASET_API_PATH=/api/public/2.0
   ```

2. **Bearer token** – Alguns ambientes Fluig Cloud usam JWT em vez de OAuth 1.0. Para obter o token:
   - Faça login no Fluig no navegador
   - Abra DevTools (F12) > Network
   - Localize uma requisição com header `Authorization: Bearer eyJ...`
   - Copie o valor e adicione: `FLUIG_BEARER_TOKEN=eyJ...`

3. **Permissões** – Confirme que o usuário do token tem acesso ao dataset em **Painel de Controle** > **Permissões** (Permission features in APIs, datasets and webservices).

4. **Nome do dataset** – Verifique em **Desenvolvimento** > **Datasets** se o nome está correto (case-sensitive).
