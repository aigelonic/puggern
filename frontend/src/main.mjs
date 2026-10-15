const status = document.querySelector('#connection-status');

function updateConnectionStatus() {
  status.textContent = navigator.onLine
    ? 'Ready to practice, online or offline.'
    : 'Offline. Your saved words stay on this device.';
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
updateConnectionStatus();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}