self.addEventListener('push', event => {
    const data = event.data?.json() ?? {};
    event.waitUntil(self.registration.showNotification(
        data.title || 'JanVax Reminder',
        {
            body: data.body || 'A vaccine is due soon.',
            icon: '/icon-192.png',
            badge: '/icon-72.png',
            data: { url: data.url || '/dashboard' },
        }
    ));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data.url));
});
