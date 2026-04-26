// Вставьте URL вашего опубликованного Google Apps Script Web App.
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxhNO4Sd0_8cy7GEieyMqoys6eav3XLPoqFz3d7E_r2/dev";
const STEP = 0.1;
const MIN_TEMP = 34.0;
const MAX_TEMP = 42.0;
const HISTORY_LIMIT = 10;

const temperatureValueEl = document.getElementById("temperatureValue");
const increaseBtn = document.getElementById("increaseBtn");
const decreaseBtn = document.getElementById("decreaseBtn");
const submitBtn = document.getElementById("submitBtn");
const statusMessageEl = document.getElementById("statusMessage");
const historyListEl = document.getElementById("historyList");

let currentTemperature = 36.6;

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
  if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL === "PASTE_GAS_WEB_APP_URL_HERE") {
    renderHistory([]);
    return;
  }

  try {
    const url = `${GAS_WEB_APP_URL}?action=history&limit=${HISTORY_LIMIT}`;
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
  if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL === "PASTE_GAS_WEB_APP_URL_HERE") {
    setStatus("Укажите URL Google Apps Script в app.js", "error");
    return;
  }

  submitBtn.disabled = true;
  setStatus("Сохраняем...", "");

  try {
    const payload = {
      temperature: Number(formatTemperature(currentTemperature)),
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(GAS_WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

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
    setStatus("Ошибка сохранения. Повторите попытку.", "error");
  } finally {
    submitBtn.disabled = false;
  }
}

increaseBtn.addEventListener("click", () => updateTemperature(STEP));
decreaseBtn.addEventListener("click", () => updateTemperature(-STEP));
submitBtn.addEventListener("click", submitTemperature);

loadHistory();
