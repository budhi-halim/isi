import { initializeTheme } from '../family/js/theme.js';
import { createNotifications } from '../family/js/notifications.js';
import { createReadinessGate } from '../family/js/readiness.js';
import { initializeTooltips } from '../family/js/tooltips.js';

initializeTheme({ toggle: document.querySelector('#theme-toggle') });
initializeTooltips();
const notices = createNotifications(document.querySelector('#notifications'));
document.querySelector('#show-success').addEventListener('click', () => notices.show('Your sample request is ready.'));
document.querySelector('#show-error').addEventListener('click', () => notices.show('Could not load the sample. Please try again.', { tone: 'error' }));
document.querySelector('#show-dialog').addEventListener('click', () => document.querySelector('#sample-dialog').showModal());
const records = [['SO-1084', 'PT Nusantara Demo', 'Approved'], ['SO-1083', 'PT Cahaya Demo', 'Pending']];
function filter() {
  const search = document.querySelector('#sample-search').value.toLowerCase();
  const status = document.querySelector('#sample-status').value;
  const body = document.querySelector('#sample-rows');
  body.replaceChildren();
  for (const record of records.filter(record => record.join(' ').toLowerCase().includes(search) && (!status || record[2] === status))) {
    const row = document.createElement('tr');
    for (const value of record) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
    body.append(row);
  }
  document.querySelector('#sample-empty').hidden = body.children.length > 0;
}
document.querySelector('#sample-search').addEventListener('input', filter);
document.querySelector('#sample-status').addEventListener('change', filter);
filter();
const gate = createReadinessGate({ host: document.querySelector('#loading-host'), content: document.querySelector('#loaded-content'), logoUrl: '../family/assets/icons/family.svg', load: signal => new Promise((resolve, reject) => { const timer = setTimeout(resolve, 1500); signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true }); }), onReady: () => {} });
gate.start();
document.querySelector('#restart-loading').addEventListener('click', () => gate.start());
window.addEventListener('pagehide', event => { notices.clear(); if (!event.persisted) gate.destroy(); });
