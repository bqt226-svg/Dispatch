'use strict';
const byId = id => document.getElementById(id);
const storageKey = 'dispatch.shift-journal.v1';
const statuses = ['Новая', 'В работе', 'Закрыта'];
const shift = byId('shift');
const shiftType = byId('shift-type');
const filter = byId('filter');
const notice = byId('notice');
const clock = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
let requests = [];
let storageReadable = true;

function localDate(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map(part => String(part).padStart(2, '0')).join('-');
}

try {
  const stored = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
  if (!Array.isArray(stored)) throw new Error('Invalid journal');
  requests = stored;
} catch {
  storageReadable = false;
  notice.textContent = 'Журнал недоступен. Проверьте настройки хранилища браузера.';
}
shift.value = localDate(new Date());

function shiftRequests() {
  return requests.filter(request => request.shift === shift.value && request.shiftType === shiftType.value);
}

function save(next) {
  if (!storageReadable) return false;
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    notice.textContent = 'Не удалось сохранить изменения в браузере.';
    return false;
  }
  requests = next;
  notice.textContent = '';
  render();
  return true;
}

function render() {
  const selected = shiftRequests();
  const completed = selected.filter(request => request.status === 'Закрыта');
  const duration = completed.reduce((sum, request) => sum + request.closedAt - request.createdAt, 0);
  byId('total').textContent = selected.length;
  byId('active').textContent = selected.filter(request => request.status === 'В работе').length;
  byId('closed').textContent = completed.length;
  byId('urgent').textContent = selected.filter(request => request.priority === 'Срочный' && request.status !== 'Закрыта').length;
  byId('average').textContent = completed.length ? Math.round(duration / completed.length / 60000) + ' мин' : '—';

  const visible = selected.filter(request => !filter.value || request.status === filter.value)
    .sort((first, second) => second.createdAt - first.createdAt);
  const rows = byId('rows');
  rows.replaceChildren();
  for (const request of visible) {
    const row = rows.insertRow();
    const description = row.insertCell();
    description.textContent = request.title;
    const timestamp = document.createElement('small');
    timestamp.textContent = clock.format(request.createdAt);
    description.append(timestamp);
    row.insertCell().textContent = request.owner || 'Не назначен';
    const priority = row.insertCell();
    priority.textContent = request.priority;
    priority.classList.toggle('urgent', request.priority === 'Срочный');
    const status = document.createElement('select');
    status.setAttribute('aria-label', 'Статус заявки «' + request.title + '»');
    for (const value of statuses) status.add(new Option(value));
    status.value = request.status;
    status.addEventListener('change', () => {
      const updated = { ...request, status: status.value, closedAt: status.value === 'Закрыта' ? Date.now() : null };
      if (!save(requests.map(item => item.id === request.id ? updated : item))) status.value = request.status;
    });
    row.insertCell().append(status);
  }
  byId('table').hidden = !visible.length;
  byId('empty').hidden = !!visible.length;
  byId('empty').textContent = selected.length ? 'По этому статусу заявок нет.' : 'В этой смене пока нет заявок.';
  byId('csv').disabled = !selected.length;
}

function newRequest(title, owner, priority, status = 'Новая', createdAt = Date.now(), closedAt = null) {
  const id = globalThis.crypto?.randomUUID?.() ?? Date.now() + '-' + Math.random();
  return { id, shift: shift.value, shiftType: shiftType.value, title, owner, priority, status, createdAt, closedAt };
}

byId('form').addEventListener('submit', event => {
  event.preventDefault();
  const title = byId('title').value.trim();
  if (!title || !shift.reportValidity()) {
    if (!title) notice.textContent = 'Укажите описание заявки.';
    return;
  }
  const request = newRequest(title, byId('owner').value.trim(), byId('priority').value);
  if (save([...requests, request])) {
    event.currentTarget.reset();
    if (filter.value && filter.value !== request.status) {
      filter.value = '';
      render();
    }
    byId('title').focus();
  }
});

byId('demo').addEventListener('click', () => {
  if (!shift.reportValidity()) return;
  if (shiftRequests().length) {
    notice.textContent = 'Для демонстрации выберите дату без заявок.';
    return;
  }
  const scheduledStart = new Date(shift.value + (shiftType.value === 'night' ? 'T20:00:00' : 'T08:00:00')).getTime();
  const start = Math.min(scheduledStart, Date.now() - 1200000);
  save([...requests,
    newRequest('Проверить сигнал с участка 2', 'Дежурная бригада', 'Срочный', 'В работе', start + 600000),
    newRequest('Принять оборудование после осмотра', 'Старший смены', 'Обычный', 'Закрыта', start, start + 480000),
    newRequest('Уточнить время прибытия подрядчика', '', 'Обычный', 'Новая', start + 1200000)
  ]);
});

function csvCell(value) {
  let text = String(value);
  if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

byId('csv').addEventListener('click', () => {
  const rows = [['Дата смены', 'Смена', 'Описание', 'Ответственный', 'Приоритет', 'Статус', 'Зарегистрирована', 'Закрыта']];
  for (const request of shiftRequests()) {
    rows.push([request.shift, request.shiftType === 'night' ? 'Ночная' : 'Дневная', request.title, request.owner, request.priority, request.status,
      clock.format(request.createdAt), request.closedAt ? clock.format(request.closedAt) : '']);
  }
  const csv = rows.map(row => row.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'dispatch-' + shift.value + '-' + shiftType.value + '.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

shift.addEventListener('change', render);
shiftType.addEventListener('change', render);
filter.addEventListener('change', render);
render();
