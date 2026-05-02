// ==================== NOTIFICATIONS ====================

export function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

export function showNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body,
            icon: '📋',
            badge: '📋'
        });
    }
}

// Sync Status Helpers
export function showSyncStatus(message, type) {
    const syncIndicator = document.getElementById('syncIndicator');
    const syncStatus = document.getElementById('syncStatus');

    syncIndicator.classList.remove('syncing', 'success', 'error');
    syncIndicator.classList.add('show', type);
    syncStatus.textContent = message;
}

export function hideSyncStatus() {
    const syncIndicator = document.getElementById('syncIndicator');
    syncIndicator.classList.remove('show');
}
