// Вставьте URL вашего опубликованного Google Apps Script Web App.
// Желательно сразу использовать /exec URL.
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbz4x_VbNPwLzniEVAh3R7BmYvXgnR8aawtWdzBCYuoy0CbjT9xnketHB-4jbSXsoFSdRA/exec";
const STEP = 0.1;
const MIN_TEMP = 34.0;
const MAX_TEMP = 42.0;
const HISTORY_LIMIT = 10;
const TOKEN_STORAGE_KEY = "temp_tracker_token_v1";

const temperatureValueEl = document.getElementById("temperatureValue");
const increaseBtn = document.getElementById("increaseBtn");
const decreaseBtn = document.getElementById("decreaseBtn");
const submitBtn = document.getElementById("submitBtn");
const statusMessageEl = document.getElementById("statusMessage");
const historyListEl = document.getElementById("historyList");
const authPanelEl = document.getElementById("authPanel");
const authCodeInputEl = document.getElementById("authCodeInput");
const authBtnEl = document.getElementById("authBtn");
const authMessageEl = document.getElementById("authMessage");
const trackerPanelEl = document.getElementById("trackerPanel");
const resetAccessBtnEl = document.getElementById("resetAccessBtn");

let currentTemperature = 36.6;
let authToken = "";
let isLocalPreviewMode = false;

function isFileProtocol() {
  return window.location.protocol === "file:";
}

function resolveGasUrl() {
  if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL === "PASTE_GAS_WEB_APP_URL_HERE") {
    return "";
  }

  const normalized = GAS_WEB_APP_URL.trim();
  // /dev работает только для тестового запуска владельцем скрипта,
  // поэтому для клиентского приложения принудительно используем /exec.
  return normalized.replace(/\/dev(?:\?.*)?$/i, "/exec");
}

function formatTemperature(value) {
  return value.toFixed(1);
}

function setStatus(message, type) {
  statusMessageEl.textContent = message;
  statusMessageEl.className = "status-message";
  if (type) {
    statusMessageEl.classList.add(type);
  }
}

function setAuthMessage(message, type) {
  authMessageEl.textContent = message;
  authMessageEl.className = "status-message";
  if (type) {
    authMessageEl.classList.add(type);
  }
}

function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  } catch (error) {
    console.error("LocalStorage is unavailable:", error);
    return "";
  }
}

function saveToken(token) {
  authToken = token;
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch (error) {
    console.error("Failed to save token:", error);
  }
}

function clearToken() {
  authToken = "";
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to remove token:", error);
  }
}

function resetAccess() {
  clearToken();
  isLocalPreviewMode = false;
  setAuthState(false);
  setStatus("", "");
  setAuthMessage("Код сброшен на этом устройстве. Введите новый код.", "success");
  authCodeInputEl.focus();
}

function setAuthState(isAuthorized) {
  authPanelEl.hidden = isAuthorized;
  trackerPanelEl.hidden = !isAuthorized;
}

async function postToGas(gasUrl, payload) {
  // Для GAS избегаем preflight: отправляем как text/plain.
  // Это повышает шанс корректной работы CORS для браузера.
  return fetch(gasUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    redirect: "follow",
  });
}

function updateTemperature(delta) {
  const nextValue = Math.min(MAX_TEMP, Math.max(MIN_TEMP, currentTemperature + delta));
  currentTemperature = Math.round(nextValue * 10) / 10;
  temperatureValueEl.textContent = formatTemperature(currentTemperature);
}

function formatTimestamp(rawTimestamp) {
  const date = new Date(rawTimestamp);
  if (Number.isNaN(date.getTime())) {
    return String(rawTimestamp);
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function renderHistory(items) {
  historyListEl.innerHTML = "";

  if (!items.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "history-item";
    emptyItem.textContent = "Записей пока нет";
    historyListEl.appendChild(emptyItem);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "history-item";
    li.innerHTML = `
      <span class="history-timestamp">${formatTimestamp(item.timestamp)}</span>
      <span class="history-temp">${formatTemperature(Number(item.temperature))}</span>
    `;
    historyListEl.appendChild(li);
  });
}

async function loadHistory() {
  const gasUrl = resolveGasUrl();
  if (!gasUrl) {
    renderHistory([]);
    return;
  }

  try {
    const url = `${gasUrl}?action=history&limit=${HISTORY_LIMIT}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const historyItems = Array.isArray(data.items) ? data.items : [];
    renderHistory(historyItems);
  } catch (error) {
    console.error("Failed to load history:", error);
    renderHistory([]);
  }
}

async function submitTemperature() {
  const gasUrl = resolveGasUrl();
  if (isLocalPreviewMode) {
    setStatus("Локальный предпросмотр: отправка отключена.", "success");
    return;
  }
  if (!gasUrl) {
    setStatus("Укажите URL Google Apps Script в app.js", "error");
    return;
  }

  submitBtn.disabled = true;
  setStatus("Сохраняем...", "");

  try {
    const payload = {
      action: "append",
      temperature: Number(formatTemperature(currentTemperature)),
      timestamp: new Date().toISOString(),
      token: authToken,
    };
    const response = await postToGas(gasUrl, payload);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || "Unknown API error");
    }

    setStatus("Данные сохранены ✓", "success");
    await loadHistory();
  } catch (error) {
    console.error("Failed to submit temperature:", error);
    const message = String(error && error.message ? error.message : "");
    if (message.includes("Token is invalid or expired")) {
      clearToken();
      setAuthState(false);
      setStatus("", "");
      setAuthMessage("Сессия истекла. Введите код снова.", "error");
      return;
    }
    setStatus(
      "Ошибка сохранения. Проверьте код доступа, deploy /exec и права Web App.",
      "error"
    );
  } finally {
    submitBtn.disabled = false;
  }
}

async function authorize() {
  const gasUrl = resolveGasUrl();
  if (!gasUrl) {
    setAuthMessage("Укажите URL Google Apps Script в app.js", "error");
    return;
  }

  const code = authCodeInputEl.value.trim();
  if (!code) {
    setAuthMessage("Введите код доступа", "error");
    return;
  }

  authBtnEl.disabled = true;
  setAuthMessage("Проверяем код...", "");

  try {
    if (isFileProtocol()) {
      throw new Error("LOCAL_FILE_ORIGIN");
    }

    const response = await postToGas(gasUrl, {
      action: "auth",
      code: code,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.ok || !data.token) {
      throw new Error(data.error || "Authentication failed");
    }

    saveToken(String(data.token));
    authCodeInputEl.value = "";
    setAuthState(true);
    setStatus("Готово. Можно отправлять данные.", "success");
    setAuthMessage("", "");
    await loadHistory();
  } catch (error) {
    console.error("Failed to authorize:", error);
    const message = String(error && error.message ? error.message : "");
    if (message.includes("LOCAL_FILE_ORIGIN") || isFileProtocol()) {
      setAuthMessage(
        "Откройте сайт через http(s), а не file:// (например, GitHub Pages или локальный сервер).",
        "error"
      );
      return;
    }
    if (message.includes("Failed to fetch")) {
      setAuthMessage(
        "Сеть/CORS: проверьте deploy Web App и открывайте страницу не из файла, а по URL.",
        "error"
      );
      return;
    }
    setAuthMessage("Неверный код или ошибка доступа к серверу.", "error");
  } finally {
    authBtnEl.disabled = false;
  }
}

increaseBtn.addEventListener("click", () => updateTemperature(STEP));
decreaseBtn.addEventListener("click", () => updateTemperature(-STEP));
submitBtn.addEventListener("click", submitTemperature);
authBtnEl.addEventListener("click", authorize);
resetAccessBtnEl.addEventListener("click", resetAccess);
authCodeInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    authorize();
  }
});

authToken = getStoredToken();
if (isFileProtocol()) {
  isLocalPreviewMode = true;
  setAuthState(true);
  setAuthMessage(
    "Локальный предпросмотр активен: можно проверить дизайн, но отправка отключена.",
    "success"
  );
  setStatus("Режим предпросмотра: публикация в таблицу отключена.", "success");
} else if (authToken) {
  setAuthState(true);
  loadHistory();
} else {
  setAuthState(false);
}
