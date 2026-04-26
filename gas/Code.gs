/**
 * Google Apps Script Web App для Temp-Tracker.
 * Колонка A: timestamp, колонка B: температура.
 */
const SHEET_NAME = "Sheet1";
const MIN_TEMP = 34.0;
const MAX_TEMP = 42.0;
const MIN_SUBMIT_INTERVAL_MS = 30 * 1000;
const AUTH_CODE_PROPERTY = "TEMP_TRACKER_AUTH_CODE";
const ACTIVE_TOKENS_PROPERTY = "TEMP_TRACKER_ACTIVE_TOKENS";
const MAX_HISTORY_LIMIT_PROPERTY = "TEMP_TRACKER_MAX_HISTORY_LIMIT";
const DEFAULT_MAX_HISTORY_LIMIT = 200;
const TOKEN_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000; // ~180 days

function doPost(e) {
  try {
    const payload = parseJsonBody_(e);
    const action = String((payload && payload.action) || "").toLowerCase();
    if (action === "auth") {
      return authenticate_(payload);
    }
    return appendFromPost_(payload);
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
    message: "Temp-Tracker GAS is running. Use POST for auth and append.",
  });
}

function appendFromPost_(payload) {
  const temperature = Number(payload.temperature);
  const timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();
  const token = String(payload.token || "").trim();

  validateTemperature_(temperature);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("Invalid timestamp");
  }
  validateToken_(token);
  enforceRateLimit_(token, timestamp);

  const sheet = getSheet_();
  sheet.appendRow([timestamp, temperature]);

  return jsonResponse_({
    ok: true,
    saved: {
      timestamp: timestamp.toISOString(),
      temperature: temperature,
    },
  });
}

function getHistory_(e) {
  try {
    const limitRaw = (e && e.parameter && e.parameter.limit) || "10";
    const maxHistoryLimit = getMaxHistoryLimit_();
    const limit = Math.max(1, Math.min(maxHistoryLimit, Number(limitRaw)));
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

function getMaxHistoryLimit_() {
  const raw = PropertiesService.getScriptProperties().getProperty(MAX_HISTORY_LIMIT_PROPERTY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_MAX_HISTORY_LIMIT;
  }
  return Math.floor(parsed);
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

function authenticate_(payload) {
  const code = String((payload && payload.code) || "").trim();
  const expectedCode = getExpectedAuthCode_();
  if (!code || code !== expectedCode) {
    return jsonResponse_({
      ok: false,
      error: "Invalid access code",
    });
  }

  const token = Utilities.getUuid();
  const now = Date.now();
  const tokenMap = getTokenMap_();
  const currentCodeHash = getCurrentCodeHash_();
  tokenMap[token] = {
    issuedAt: now,
    lastSubmitAt: 0,
    codeHash: currentCodeHash,
  };
  saveTokenMap_(tokenMap);

  return jsonResponse_({
    ok: true,
    token: token,
    tokenExpiresInMs: TOKEN_MAX_AGE_MS,
  });
}

function getExpectedAuthCode_() {
  const value = PropertiesService.getScriptProperties().getProperty(AUTH_CODE_PROPERTY);
  if (!value) {
    throw new Error(
      "Auth code is not configured. Set Script Property TEMP_TRACKER_AUTH_CODE."
    );
  }
  return value.trim();
}

function getCurrentCodeHash_() {
  const expectedCode = getExpectedAuthCode_();
  return toHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, expectedCode));
}

function getTokenMap_() {
  const raw = PropertiesService.getScriptProperties().getProperty(ACTIVE_TOKENS_PROPERTY);
  if (!raw) {
    return {};
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {};
  }
  return removeExpiredTokens_(parsed);
}

function saveTokenMap_(tokenMap) {
  const cleaned = removeExpiredTokens_(tokenMap);
  PropertiesService.getScriptProperties().setProperty(
    ACTIVE_TOKENS_PROPERTY,
    JSON.stringify(cleaned)
  );
}

function removeExpiredTokens_(tokenMap) {
  const now = Date.now();
  const result = {};
  Object.keys(tokenMap || {}).forEach(function (token) {
    const tokenData = tokenMap[token];
    if (!tokenData || typeof tokenData.issuedAt !== "number") {
      return;
    }
    if (now - tokenData.issuedAt > TOKEN_MAX_AGE_MS) {
      return;
    }
    result[token] = tokenData;
  });
  return result;
}

function validateToken_(token) {
  if (!token) {
    throw new Error("Missing token");
  }
  const tokenMap = getTokenMap_();
  const tokenData = tokenMap[token];
  if (!tokenData) {
    throw new Error("Token is invalid or expired");
  }
  // При смене семейного кода все старые токены становятся недействительными.
  const currentCodeHash = getCurrentCodeHash_();
  if (tokenData.codeHash !== currentCodeHash) {
    delete tokenMap[token];
    saveTokenMap_(tokenMap);
    throw new Error("Token is invalid or expired");
  }
}

function enforceRateLimit_(token, timestamp) {
  const tokenMap = getTokenMap_();
  const tokenData = tokenMap[token];
  if (!tokenData) {
    throw new Error("Token is invalid or expired");
  }

  const submitAt = timestamp.getTime();
  if (submitAt - tokenData.lastSubmitAt < MIN_SUBMIT_INTERVAL_MS) {
    throw new Error("Too many requests. Please wait before sending again.");
  }

  tokenData.lastSubmitAt = submitAt;
  tokenMap[token] = tokenData;
  saveTokenMap_(tokenMap);
}

function validateTemperature_(temperature) {
  if (Number.isNaN(temperature)) {
    throw new Error("Temperature is required and must be a number");
  }
  if (temperature < MIN_TEMP || temperature > MAX_TEMP) {
    throw new Error(
      "Temperature is out of allowed range (" + MIN_TEMP + " - " + MAX_TEMP + ")"
    );
  }
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function toHex_(bytes) {
  return bytes
    .map(function (b) {
      const value = b < 0 ? b + 256 : b;
      return ("0" + value.toString(16)).slice(-2);
    })
    .join("");
}
