/**
 * Apps Script para sincronizar o Banco CAT's com a planilha.
 *
 * Como publicar:
 * 1. Abra a planilha → Extensões → Apps Script
 * 2. Cole este código e salve
 * 3. Defina a constante WEBHOOK_SECRET abaixo (mesmo valor do .env BANCO_CATS_WEBHOOK_SECRET)
 * 4. Implantar → Nova implantação → Tipo: App da Web
 *    - Executar como: Eu
 *    - Quem tem acesso: Qualquer pessoa
 * 5. Copie a URL da implantação para BANCO_CATS_WEBHOOK_URL no .env do backend
 */

var WEBHOOK_SECRET = 'troque-por-um-segredo-forte';
var DEFAULT_SHEET_NAME = 'Serviços';

function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    if (WEBHOOK_SECRET && data.secret !== WEBHOOK_SECRET) {
      return json_({ ok: false, error: 'Secret inválido.' });
    }

    if (data.action && data.action !== 'append') {
      return json_({ ok: false, error: 'Ação não suportada.' });
    }

    var values = data.values;
    if (!Array.isArray(values) || values.length === 0) {
      return json_({ ok: false, error: 'values inválido.' });
    }

    var spreadsheet = data.spreadsheetId
      ? SpreadsheetApp.openById(String(data.spreadsheetId))
      : SpreadsheetApp.getActiveSpreadsheet();

    var sheetName = data.sheetName ? String(data.sheetName) : DEFAULT_SHEET_NAME;
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      return json_({ ok: false, error: 'Aba não encontrada: ' + sheetName });
    }

    sheet.appendRow(values.map(function (cell) {
      return cell == null ? '' : String(cell);
    }));

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doGet() {
  return json_({ ok: true, message: 'Banco CAT\'s webhook ativo.' });
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
