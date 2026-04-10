/* ─────────────────────────────────────────────────────────────────────────────
   Task Manager — Service Worker
   Handles Web Push events so notifications appear even when the tab is closed.
   ───────────────────────────────────────────────────────────────────────────── */

const APP_URL = self.location.origin;

// ── Install & Activate ────────────────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// ── Push Event ────────────────────────────────────────────────────────────────
// This fires when the FastAPI backend sends a Web Push message.
// It works even if the browser tab is closed (as long as Chrome/Edge is running).
self.addEventListener('push', (event) => {
    let data = { title: '⏰ Task Reminder', body: 'You have an upcoming task!' };

    try {
        if (event.data) {
            data = event.data.json();
        }
    } catch (_) {
        data.body = event.data ? event.data.text() : data.body;
    }

    const title = data.title || '⏰ Task Reminder';
    const options = {
        body: data.body || 'You have an upcoming task!',
        icon: '/vite.svg',
        badge: '/vite.svg',
        tag: `task-${data.task_id || Date.now()}`,   // replaces older notification for same task
        renotify: true,
        requireInteraction: true,   // stays until user dismisses it
        vibrate: [200, 100, 200],
        data: { task_id: data.task_id, url: APP_URL },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification Click ────────────────────────────────────────────────────────
// When the user clicks the notification, open/focus the app.
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // If a tab is already open, focus it
                for (const client of clientList) {
                    if (client.url.startsWith(APP_URL) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Otherwise open a new tab
                if (self.clients.openWindow) {
                    return self.clients.openWindow(APP_URL);
                }
            })
    );
});
