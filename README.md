# Temp-Tracker (prototype)

## Что внутри
- `index.html` - мобильный интерфейс.
- `styles.css` - стили (mobile first, крупные элементы).
- `app.js` - логика изменения температуры, отправка в GAS, история.
- `gas/Code.gs` - Google Apps Script Web App (`doPost`, `doGet` для истории).

## Быстрый запуск
1. Откройте Google Spreadsheet.
2. Откройте `Extensions -> Apps Script`.
3. Вставьте содержимое `gas/Code.gs` в файл проекта GAS.
4. Проверьте, что лист и колонки подходят под структуру:
   - `A`: timestamp
   - `B`: temperature
5. Опубликуйте как Web App:
   - `Deploy -> New deployment -> Web app`
   - `Execute as`: `Me`
   - `Who has access`: `Anyone with the link`
6. Скопируйте URL Web App и вставьте его в `app.js` вместо:
   - `PASTE_GAS_WEB_APP_URL_HERE`
7. Откройте `index.html` в браузере.

## Проверка
- Нажимайте `▲`/`▼`, значение меняется шагом `0.1`.
- Нажмите `Отправить данные` -> появится сообщение `Данные сохранены ✓`.
- В Google Sheets появляется новая строка.
- Блок "Последние записи" показывает до 10 последних строк.
