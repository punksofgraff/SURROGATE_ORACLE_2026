/**
 * Centralized notification system for temporary user feedback
 */

interface NotificationOptions {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export function showNotification({
  message,
  type = 'success',
  duration = 3000,
  position = 'top-right'
}: NotificationOptions): void {
  // Create notification element
  const notification = document.createElement('div');
  
  // Set base styles
  const baseStyles = {
    position: 'fixed',
    zIndex: '9999',
    padding: '12px 20px',
    borderRadius: '8px',
    color: 'white',
    fontFamily: "'PhillySans', 'Orbitron', monospace",
    fontSize: '0.9rem',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    backdropFilter: 'blur(10px)',
    border: '1px solid transparent',
    transition: 'all 0.3s ease',
    maxWidth: '300px',
    wordWrap: 'break-word'
  };

  // Set position styles
  const positionStyles = {
    'top-right': { top: '20px', right: '20px' },
    'top-left': { top: '20px', left: '20px' },
    'bottom-right': { bottom: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' }
  };

  // Set type-specific styles
  const typeStyles = {
    success: {
      background: 'rgba(0, 255, 136, 0.2)',
      borderColor: 'rgba(0, 255, 136, 0.5)',
      color: '#00ff88'
    },
    error: {
      background: 'rgba(255, 0, 102, 0.2)',
      borderColor: 'rgba(255, 0, 102, 0.5)',
      color: '#ff0066'
    },
    info: {
      background: 'rgba(0, 255, 255, 0.2)',
      borderColor: 'rgba(0, 255, 255, 0.5)',
      color: '#00ffff'
    },
    warning: {
      background: 'rgba(255, 215, 0, 0.2)',
      borderColor: 'rgba(255, 215, 0, 0.5)',
      color: '#ffd700'
    }
  };

  // Apply styles
  Object.assign(notification.style, baseStyles, positionStyles[position], typeStyles[type]);

  // Set content
  notification.textContent = message;
  notification.setAttribute('role', 'alert');
  notification.setAttribute('aria-live', 'polite');

  // Add to DOM with entrance animation
  notification.style.opacity = '0';
  notification.style.transform = 'translateY(-20px)';
  document.body.appendChild(notification);

  // Trigger entrance animation
  requestAnimationFrame(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateY(0)';
  });

  // Auto-remove after duration
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(-20px)';
    
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 300);
  }, duration);
}

// Convenience methods
export const showSuccessNotification = (message: string, duration?: number) => 
  showNotification({ message, type: 'success', duration });

export const showErrorNotification = (message: string, duration?: number) => 
  showNotification({ message, type: 'error', duration });

export const showInfoNotification = (message: string, duration?: number) => 
  showNotification({ message, type: 'info', duration });

export const showWarningNotification = (message: string, duration?: number) => 
  showNotification({ message, type: 'warning', duration });