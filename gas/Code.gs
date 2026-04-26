/**
 * Google Apps Script Web App для Temp-Tracker.
 * Колонка A: timestamp, колонка B: температура.
 */
const SHEET_NAME = "Sheet1";

function doPost(e) {
  try {
    const payload = parseJsonBody_(e);
    const temperature = Number(payload.temperature);
    const timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();

    if (Number.isNaN(temperature)) {
      throw new Error("Temperature is required and must be a number");
    }
    if (Number.isNaN(timestamp.getTime())) {
      throw new Error("Invalid timestamp");
    }

    const sheet = getSheet_();
    sheet.appendRow([timestamp, temperature]);

    return jsonResponse_({
      ok: true,
      saved: {
        timestamp: timestamp.toISOString(),
        temperature: temperature,
      },
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error.message || "Unexpected error",
    });
  }
}

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "";
  if (action === "history") {
    return getHistory_(e);
  }

  return jsonResponse_({
    ok: true,
    message: "Temp-Tracker GAS is running",
  });
}

function getHistory_(e) {
  try {
    const limitRaw = (e && e.parameter && e.parameter.limit) || "10";
    const limit = Math.max(1, Math.min(10, Number(limitRaw)));
    const sheet = getSheet_();
    const lastRow = sheet.getLastRow();

    if (lastRow < 1) {
      return jsonResponse_({ ok: true, items: [] });
    }

    const startRow = Math.max(1, lastRow - limit + 1);
    const rowCount = lastRow - startRow + 1;
    const values = sheet.getRange(startRow, 1, rowCount, 2).getValues();

    const items = values
      .map(function (row) {
        return {
          timestamp: row[0] instanceof Date ? row[0].toISOString() : String(row[0]),
          temperature: Number(row[1]),
        };
      })
      .reverse();

    return jsonResponse_({ ok: true, items: items });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error.message || "Unexpected error",
      items: [],
    });
  }
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getActiveSheet();
  return sheet;
}

function parseJsonBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("Request body is empty");
  }
  return JSON.parse(e.postData.contents);
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON
  );
}
