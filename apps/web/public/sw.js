// Service worker do PWA: só notificações push (sem cache offline). Precisa ser .js puro servido na raiz.
self.addEventListener("push", (e) => {
  const m = e.data ? e.data.json() : { titulo: "AdPilot", corpo: "", url: "/" };
  e.waitUntil(self.registration.showNotification(m.titulo, { body: m.corpo, tag: m.tag, icon: "/icon.png", badge: "/icon.png", data: { url: m.url || "/" } }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abas) => {
    const aba = abas.find((a) => a.url.startsWith(self.location.origin));
    return aba ? aba.navigate(url).then((a) => (a || aba).focus()) : self.clients.openWindow(url);
  }));
});
