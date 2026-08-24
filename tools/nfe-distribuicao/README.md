# Worker Java — distribuição DF-e (NF-e recebidas)

Usado pelo backend quando você clica em **Buscar** na tela de NFs Recebidas.

## 1) Compilar (local)

```bash
cd tools/nfe-distribuicao
mvn -q package
```

Gera: `tools/nfe-distribuicao/target/nfe-distribuicao.jar`

No deploy Railway, o script `scripts/railway-build-backend.sh` já baixa JDK + Maven e gera o JAR em `apps/backend/native/nfe-distribuicao.jar`.

## 2) Variáveis no `.env` do backend (local)

```env
NFE_JAVA_ENABLED=1
NFE_WORKER_JAR=C:\caminho\completo\tools\nfe-distribuicao\target\nfe-distribuicao.jar
NFE_JAVA_BIN=java
NFE_CERT_PATH=C:\caminho\certificado.p12
NFE_CERT_PASSWORD=sua_senha
NFE_CADEIA_PATH=C:\caminho\cadeia_producao.jks
NFE_CADEIA_PASSWORD=changeit
NFE_CNPJ=17851596000136
NFE_UF=SP
NFE_AMBIENTE=PRODUCAO
NFE_MAX_CONSULTAS=50

# Busca automática diária (local e Railway — mesmo processo do backend)
NFE_AUTO_FETCH_ENABLED=1
NFE_AUTO_FETCH_YEAR=2026
# Cron: 06:00 todo dia (timezone America/Sao_Paulo)
NFE_AUTO_FETCH_CRON=0 6 * * *
# Opcional: rodar também ao subir o servidor
# NFE_AUTO_FETCH_ON_BOOT=1
# NFE_AUTO_FETCH_BOOT_DELAY_MS=60000

# Opcional no Railway: Cron Job externo batendo neste endpoint
# POST /api/nfe-recebidas/cron  Header: x-cron-secret: <mesmo valor>
NFE_CRON_SECRET=troque-por-um-segredo-longo
```

Sem Java, dá para só importar XMLs já baixados:

```env
NFE_XML_DIR=C:\Users\lucas\OneDrive\Área de Trabalho\teste nfe\notas_julho_agosto_2026
```

## 3) Cadeia de certificados

Use o `GerarCadeiaCertificados.java` da pasta `teste nfe` para gerar o `.jks` antes.

## 4) Railway

### O que o deploy já faz sozinho

No build do backend:

1. Instala JDK 17 em `.tools/jdk`
2. Compila o worker e copia para `apps/backend/native/nfe-distribuicao.jar`
3. Na subida, o `PATH` inclui `.tools/jdk/bin` (comando `java` disponível)

Depois do deploy, no Console do backend:

```bash
java -version
ls -la apps/backend/native/nfe-distribuicao.jar
```

### Variáveis para colar no serviço Back-end

```env
NFE_JAVA_ENABLED=1
NFE_JAVA_BIN=java
NFE_CNPJ=17851596000136
NFE_UF=SP
NFE_AMBIENTE=PRODUCAO
NFE_MAX_CONSULTAS=80
NFE_AUTO_FETCH_ENABLED=1
NFE_AUTO_FETCH_YEAR=2026
NFE_AUTO_FETCH_CRON=0 6 * * *
NFE_CRON_SECRET=troque-por-um-segredo-longo-e-aleatorio
NFE_CERT_PASSWORD=sua_senha_do_p12
NFE_CADEIA_PASSWORD=changeit
```

### Certificado e cadeia (Base64 — mais fácil no Railway)

No PowerShell (no seu PC), gere o Base64 dos arquivos:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\certificado.p12")) | Set-Clipboard
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\cadeia_producao.jks")) | Set-Clipboard
```

Cole no Railway:

```env
NFE_CERT_BASE64=cole_aqui_o_base64_do_p12
NFE_CADEIA_BASE64=cole_aqui_o_base64_do_jks
```

Na subida, o backend grava os arquivos sozinho e define `NFE_CERT_PATH` / `NFE_CADEIA_PATH`.

(Não precisa setar `NFE_WORKER_JAR` em produção — o caminho padrão já aponta para o JAR gerado no build.)

### Cron (opcional)

Com o web service ligado, o `node-cron` interno já busca todo dia às 6h.  
Alternativa: Cron Job no Railway:

`curl -X POST -H "x-cron-secret: $NFE_CRON_SECRET" https://SEU-BACKEND/api/nfe-recebidas/cron`
