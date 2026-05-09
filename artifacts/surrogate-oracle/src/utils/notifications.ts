export function showSuccessNotification(message: string) {
  console.log('✅', message);
  // Simple DOM-based notification fallback
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 9999;
    background: rgba(0, 255, 100, 0.15); border: 1px solid #00ff64;
    color: #00ff64; padding: 12px 20px; border-radius: 8px;
    font-family: 'Orbitron', monospace; font-size: 13px;
    backdrop-filter: blur(10px); animation: fadeIn 0.3s ease;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

export function showErrorNotification(message: string) {
  console.error('❌', message);
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 9999;
    background: rgba(255, 0, 80, 0.15); border: 1px solid #ff0050;
    color: #ff0050; padding: 12px 20px; border-radius: 8px;
    font-family: 'Orbitron', monospace; font-size: 13px;
    backdrop-filter: blur(10px); animation: fadeIn 0.3s ease;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
