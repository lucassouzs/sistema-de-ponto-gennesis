package br.gennesis.nfe;

import com.fincatto.documentofiscal.DFAmbiente;
import com.fincatto.documentofiscal.DFUnidadeFederativa;
import com.fincatto.documentofiscal.nfe.NFeConfig;
import com.fincatto.documentofiscal.nfe.classes.distribuicao.NFDistribuicaoDFeLote;
import com.fincatto.documentofiscal.nfe.classes.distribuicao.NFDistribuicaoDocumentoZip;
import com.fincatto.documentofiscal.nfe.classes.distribuicao.NFDistribuicaoIntRetorno;
import com.fincatto.documentofiscal.nfe.webservices.distribuicao.WSDistribuicaoNFe;
import com.fincatto.documentofiscal.nfe400.webservices.WSFacade;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileWriter;
import java.security.KeyStore;
import java.security.KeyStoreException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * CLI chamado pelo backend Node sob demanda.
 *
 * Env:
 *  NFE_CERT_PATH, NFE_CERT_PASSWORD, NFE_CADEIA_PATH, NFE_CADEIA_PASSWORD,
 *  NFE_CNPJ, NFE_UF, NFE_AMBIENTE (PRODUCAO|HOMOLOGACAO)
 *
 * Args:
 *  --ult-nsu=000... --out-dir=./xmls --max-consultas=50
 *  --period-from=AAAA-MM-DD --period-to=AAAA-MM-DD (opcional; filtra por dhEmi/dEmi)
 *  --chave=44digitos (consulta pontual do XML completo pela chave de acesso)
 *
 * Imprime uma linha JSON no stdout ao final.
 * A SEFAZ entrega por NSU; o período só decide quais NFes entram em "docs".
 * Grava procNFe (completo) e resNFe (resumo). Eventos são ignorados.
 */
public class NfeDistribuicaoCli {

  public static void main(String[] args) {
    try {
      Map<String, String> flags = parseArgs(args);
      String outDirPath = flags.getOrDefault("out-dir", env("NFE_OUT_DIR", "./nfe-out"));
      String chaveFlag = emptyToNull(flags.get("chave"));

      File outDir = new File(outDirPath);
      if (!outDir.exists() && !outDir.mkdirs()) {
        fail("Não foi possível criar pasta de saída: " + outDir.getAbsolutePath());
        return;
      }

      EnvNFeConfig config = new EnvNFeConfig();
      WSFacade facade = new WSFacade(config);

      String cnpj = required("NFE_CNPJ").replaceAll("\\D", "");
      DFUnidadeFederativa uf = config.getCUF();

      if (chaveFlag != null) {
        runConsultaPorChave(facade, cnpj, uf, chaveFlag, outDir);
        return;
      }

      String ultNsu = padNsu(flags.getOrDefault("ult-nsu", env("NFE_ULT_NSU", "000000000000000")));
      int maxConsultas = Integer.parseInt(flags.getOrDefault("max-consultas", env("NFE_MAX_CONSULTAS", "50")));
      String periodFrom = emptyToNull(flags.get("period-from"));
      String periodTo = emptyToNull(flags.get("period-to"));

      String ultimoNSU = ultNsu;
      int totalConsultas = 0;
      int docsCount = 0;
      int lotesRecebidos = 0;
      boolean continuar = true;
      String statusCodigo = "";
      String statusMotivo = "";

      while (continuar && totalConsultas < maxConsultas) {
        totalConsultas++;
        NFDistribuicaoIntRetorno retorno =
            facade.consultarDistribuicaoDFe(cnpj, uf, null, null, ultimoNSU);

        String codigo = retorno.getCodigoStatusReposta();
        statusCodigo = codigo == null ? "" : codigo;
        statusMotivo = retorno.getMotivo() == null ? "" : retorno.getMotivo();

        if ("137".equals(codigo)) {
          continuar = false;
          break;
        }

        String novoUltimoNSU = retorno.getUltimoNSU();
        if (novoUltimoNSU == null || novoUltimoNSU.equals(ultimoNSU)) {
          continuar = false;
          break;
        }
        ultimoNSU = padNsu(novoUltimoNSU);

        if (retorno.getLote() != null && retorno.getLote().getDocZip() != null) {
          lotesRecebidos += retorno.getLote().getDocZip().size();
        }
        docsCount += saveDistribuicaoDocs(retorno.getLote(), outDir, periodFrom, periodTo, false);

        Thread.sleep(400);
      }

      Map<String, Object> result = new LinkedHashMap<>();
      result.put("ok", true);
      result.put("ultimoNsu", ultimoNSU);
      result.put("docsCount", Integer.valueOf(docsCount));
      result.put("documentosRecebidos", Integer.valueOf(lotesRecebidos));
      result.put("statusCodigo", statusCodigo);
      result.put("statusMotivo", statusMotivo);
      result.put("docs", new ArrayList<Map<String, String>>());
      String periodMsg =
          (periodFrom != null || periodTo != null)
              ? "; periodo="
                  + (periodFrom == null ? "…" : periodFrom)
                  + ".."
                  + (periodTo == null ? "…" : periodTo)
              : "";
      result.put(
          "message",
          "Consultas="
              + totalConsultas
              + "; documentos="
              + lotesRecebidos
              + "; notas="
              + docsCount
              + periodMsg
              + "; ultimoNsu="
              + ultimoNSU
              + "; cStat="
              + (statusCodigo.isEmpty() ? "?" : statusCodigo)
              + (statusMotivo.isEmpty() ? "" : " (" + statusMotivo + ")"));
      System.out.println(toJson(result));
    } catch (Exception e) {
      fail(e.getMessage() == null ? e.toString() : e.getMessage());
    }
  }

  /** Consulta pontual: retorna o XML completo (procNFe) da chave, se disponível. */
  private static void runConsultaPorChave(
      WSFacade facade, String cnpj, DFUnidadeFederativa uf, String chaveRaw, File outDir)
      throws Exception {
    String chave = chaveRaw.replaceAll("\\D", "");
    if (chave.length() != 44) {
      fail("Chave de acesso inválida (precisa ter 44 dígitos): " + chaveRaw);
      return;
    }

    NFDistribuicaoIntRetorno retorno =
        facade.consultarDistribuicaoDFe(cnpj, uf, chave, null, null);

    String codigo = retorno.getCodigoStatusReposta();
    int docsCount = saveDistribuicaoDocs(retorno.getLote(), outDir, null, null, true);

    // Preferir nome estável pela chave (sobrescreve resumo antigo).
    String savedAs = null;
    File byChave = new File(outDir, "NFe-" + chave + ".xml");
    if (docsCount > 0 && byChave.exists()) {
      savedAs = byChave.getName();
    } else if (docsCount > 0) {
      File[] files = outDir.listFiles((dir, name) -> name.toLowerCase().endsWith(".xml") && name.contains(chave));
      if (files != null && files.length > 0) {
        savedAs = files[0].getName();
      }
    }

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("ok", true);
    result.put("chave", chave);
    result.put("statusCodigo", codigo == null ? "" : codigo);
    result.put("docsCount", Integer.valueOf(docsCount));
    result.put("fileName", savedAs == null ? "" : savedAs);
    result.put(
        "message",
        docsCount > 0
            ? "XML completo obtido pela chave."
            : ("Nenhum procNFe retornado (status="
                + (codigo == null ? "?" : codigo)
                + "). Pode ser só resumo ou nota fora da janela de 90 dias."));
    result.put("docs", new ArrayList<Map<String, String>>());
    System.out.println(toJson(result));
  }

  /**
   * Grava XML da distribuição: procNFe (completo) e resNFe (resumo).
   * Eventos são ignorados. Se já existir completo da mesma chave, não grava resumo.
   * @param onlyComplete quando true (consulta por chave), ignora resumos.
   */
  private static int saveDistribuicaoDocs(
      NFDistribuicaoDFeLote lote,
      File outDir,
      String periodFrom,
      String periodTo,
      boolean onlyComplete) {
    int docsCount = 0;
    if (lote == null || lote.getDocZip() == null) return 0;

    for (NFDistribuicaoDocumentoZip docZip : lote.getDocZip()) {
      String schema = docZip.getSchema();
      String conteudoZip = docZip.getValue();
      String nsuDoc = padNsu(docZip.getNsu());
      if (conteudoZip == null || conteudoZip.isEmpty()) continue;

      try {
        String xml = WSDistribuicaoNFe.decodeGZipToXml(conteudoZip);
        if (isEventoNfe(schema, xml)) continue;

        boolean complete = isXmlCompletoNfe(schema, xml);
        boolean resumo = isResumoNfe(schema, xml);
        if (!complete && !resumo) continue;
        if (onlyComplete && !complete) continue;
        if (!isNotaNoPeriodo(xml, periodFrom, periodTo)) continue;

        String chave = extractChave(xml);
        File arquivo;
        if (complete) {
          if (chave != null && chave.length() == 44) {
            arquivo = new File(outDir, "NFe-" + chave + ".xml");
          } else {
            arquivo = new File(outDir, "NFe_" + nsuDoc + ".xml");
          }
        } else {
          // Resumo: não sobrescrever XML completo já existente.
          if (chave != null && chave.length() == 44) {
            File full = new File(outDir, "NFe-" + chave + ".xml");
            if (full.exists()) continue;
            arquivo = new File(outDir, "resNFe-" + chave + ".xml");
          } else {
            arquivo = new File(outDir, "resNFe_" + nsuDoc + ".xml");
          }
        }

        try (FileWriter writer = new FileWriter(arquivo)) {
          writer.write(xml);
        }
        docsCount++;
      } catch (Exception ex) {
        System.err.println("Falha ao processar NSU " + nsuDoc + ": " + ex.getMessage());
      }
    }
    return docsCount;
  }

  private static boolean isEventoNfe(String schema, String xml) {
    String s = schema == null ? "" : schema.toLowerCase();
    if (s.contains("resevento") || s.contains("procevento")) return true;
    if (xml == null) return false;
    return xml.contains("<resEvento") || xml.contains("<procEventoNFe");
  }

  private static boolean isResumoNfe(String schema, String xml) {
    String s = schema == null ? "" : schema.toLowerCase();
    if (s.contains("resnfe")) return true;
    if (xml == null) return false;
    return xml.contains("<resNFe") && !isXmlCompletoNfe(schema, xml);
  }

  /** Aceita documento autorizado completo (procNFe / nfeProc). */
  private static boolean isXmlCompletoNfe(String schema, String xml) {
    String s = schema == null ? "" : schema.toLowerCase();
    if (s.contains("resnfe") || s.contains("resevento") || s.contains("procevento")) {
      return false;
    }
    if (s.contains("procnfe") || s.contains("nfeproc")) {
      return true;
    }
    if (xml == null) return false;
    if (xml.contains("<resNFe")) return false;
    return xml.contains("<nfeProc") || (xml.contains("<NFe") && xml.contains("<infNFe"));
  }

  private static String extractChave(String xml) {
    String ch = extractTag(xml, "chNFe");
    if (ch != null) {
      String digits = ch.replaceAll("\\D", "");
      if (digits.length() == 44) return digits;
    }
    // Id="NFe{44}"
    int idx = xml.indexOf("Id=\"NFe");
    if (idx >= 0) {
      int start = idx + 7;
      if (start + 44 <= xml.length()) {
        String maybe = xml.substring(start, start + 44).replaceAll("\\D", "");
        if (maybe.length() == 44) return maybe;
      }
    }
    return null;
  }

  private static String emptyToNull(String s) {
    if (s == null) return null;
    String t = s.trim();
    return t.isEmpty() ? null : t;
  }

  /** Extrai AAAA-MM-DD de dhEmi/dEmi (ou AAMM da chave) e compara com o período (inclusive). */
  private static boolean isNotaNoPeriodo(String xml, String from, String to) {
    if (from == null && to == null) return true;
    String emi = extractTag(xml, "dhEmi");
    if (emi == null) emi = extractTag(xml, "dEmi");
    String ymd = null;
    if (emi != null && emi.length() >= 10) {
      ymd = emi.substring(0, 10);
    } else {
      String chave = extractChave(xml);
      if (chave != null && chave.length() == 44) {
        // Chave: UF(2) + AAMM(4) + ...
        String aamm = chave.substring(2, 6);
        if (aamm.matches("\\d{4}")) {
          ymd = "20" + aamm.substring(0, 2) + "-" + aamm.substring(2, 4) + "-15";
        }
      }
    }
    if (ymd == null) return false;
    if (from != null && ymd.compareTo(from) < 0) return false;
    if (to != null && ymd.compareTo(to) > 0) return false;
    return true;
  }

  private static String extractTag(String xml, String tag) {
    String open = "<" + tag;
    int i = xml.indexOf(open);
    if (i < 0) {
      i = xml.indexOf("<" + tag.toLowerCase());
      if (i < 0) return null;
    }
    int gt = xml.indexOf('>', i);
    if (gt < 0) return null;
    int close = xml.indexOf("</", gt);
    if (close < 0) return null;
    return xml.substring(gt + 1, close).trim();
  }

  private static void fail(String message) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("ok", false);
    result.put("error", message);
    System.out.println(toJson(result));
    System.exit(1);
  }

  private static String env(String key, String fallback) {
    String v = System.getenv(key);
    return v == null || v.trim().isEmpty() ? fallback : v.trim();
  }

  private static String required(String key) {
    String v = System.getenv(key);
    if (v == null || v.trim().isEmpty()) {
      throw new IllegalStateException("Env obrigatória ausente: " + key);
    }
    return v.trim();
  }

  private static String padNsu(String nsu) {
    String digits = (nsu == null ? "" : nsu).replaceAll("\\D", "");
    if (digits.isEmpty()) digits = "0";
    if (digits.length() > 15) digits = digits.substring(digits.length() - 15);
    return String.format("%15s", digits).replace(' ', '0');
  }

  private static Map<String, String> parseArgs(String[] args) {
    Map<String, String> map = new LinkedHashMap<>();
    for (String arg : args) {
      if (!arg.startsWith("--")) continue;
      String body = arg.substring(2);
      int eq = body.indexOf('=');
      if (eq < 0) map.put(body, "true");
      else map.put(body.substring(0, eq), body.substring(eq + 1));
    }
    return map;
  }

  private static String toJson(Object value) {
    if (value == null) return "null";
    if (value instanceof String) return "\"" + escape((String) value) + "\"";
    if (value instanceof Number || value instanceof Boolean) return String.valueOf(value);
    if (value instanceof List) {
      StringBuilder sb = new StringBuilder("[");
      List<?> list = (List<?>) value;
      for (int i = 0; i < list.size(); i++) {
        if (i > 0) sb.append(',');
        sb.append(toJson(list.get(i)));
      }
      return sb.append(']').toString();
    }
    if (value instanceof Map) {
      StringBuilder sb = new StringBuilder("{");
      boolean first = true;
      for (Map.Entry<?, ?> e : ((Map<?, ?>) value).entrySet()) {
        if (!first) sb.append(',');
        first = false;
        sb.append(toJson(String.valueOf(e.getKey()))).append(':').append(toJson(e.getValue()));
      }
      return sb.append('}').toString();
    }
    return "\"" + escape(String.valueOf(value)) + "\"";
  }

  private static String escape(String s) {
    return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r");
  }

  static class EnvNFeConfig extends NFeConfig {
    @Override
    public DFUnidadeFederativa getCUF() {
      String uf = required("NFE_UF").toUpperCase();
      return DFUnidadeFederativa.valueOf(uf);
    }

    @Override
    public String getCertificadoSenha() {
      return required("NFE_CERT_PASSWORD");
    }

    @Override
    public String getCadeiaCertificadosSenha() {
      return env("NFE_CADEIA_PASSWORD", "changeit");
    }

    @Override
    public KeyStore getCertificadoKeyStore() throws KeyStoreException {
      try {
        KeyStore keyStore = KeyStore.getInstance("PKCS12");
        try (FileInputStream fis = new FileInputStream(required("NFE_CERT_PATH"))) {
          keyStore.load(fis, getCertificadoSenha().toCharArray());
        }
        return keyStore;
      } catch (Exception e) {
        throw new KeyStoreException("Erro ao carregar certificado: " + e.getMessage(), e);
      }
    }

    @Override
    public KeyStore getCadeiaCertificadosKeyStore() throws KeyStoreException {
      try {
        KeyStore keyStore = KeyStore.getInstance("JKS");
        try (FileInputStream fis = new FileInputStream(required("NFE_CADEIA_PATH"))) {
          keyStore.load(fis, getCadeiaCertificadosSenha().toCharArray());
        }
        return keyStore;
      } catch (Exception e) {
        throw new KeyStoreException("Erro ao carregar cadeia: " + e.getMessage(), e);
      }
    }

    @Override
    public DFAmbiente getAmbiente() {
      String amb = env("NFE_AMBIENTE", "PRODUCAO").toUpperCase();
      return "HOMOLOGACAO".equals(amb) ? DFAmbiente.HOMOLOGACAO : DFAmbiente.PRODUCAO;
    }
  }
}
