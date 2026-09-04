# Daily reminders — feasibility, and why nothing shipped

**Status: HELD. No reminder setting exists in the app, deliberately.**

The wanted behaviour is: turn on a daily reminder, pick a local time, and have
the installed iPhone web app notify you then — tapping it opening that day's
reading. This is a note on whether that can be built the way Daily Verse is
currently built, which is a static site on GitHub Pages with no backend.

Short answer: **not without adding a server.** The web platform removed the
only standards-based way to do it locally, and iOS never had one.

---

## What was investigated

### 1. Notifications API — works, but only while you are there

`ServiceWorkerRegistration.showNotification()` displays a notification
immediately. It needs permission and a service worker, both of which this app
already has. What it cannot do is fire later: something has to be running to
call it.

### 2. Notification Triggers — the API that would have solved this, abandoned

`showTrigger` with a `TimestampTrigger` was designed for exactly this case: ask
the service worker to display a notification at a future timestamp, with no
network involved, backed by the operating system's own alarm scheduler.

It never shipped. Chrome's own documentation now lists it under **"No longer
pursuing"**, with the reason given as: *"It wasn't clear that we could provide
consistent and reliable experiences across platforms."* It reached an origin
trial in 2020 and went no further. No browser implements it in a stable
release, and no other engine picked it up.

This is the crux. Had it shipped, Daily Verse could have scheduled reminders
entirely on the device with no server and no data leaving it.

### 3. Push API on iOS — works, and is the only route left

iOS 16.4 and later do support the standard Web Push Protocol, with two
conditions this app already meets: the site must be **installed to the Home
Screen**, and the manifest must declare `display: standalone`. `PushManager`
does not even appear in the service worker until the app is installed.
Authentication is ordinary VAPID, the same as every other browser.

But push is *push*. A message arrives because something outside the device sent
an HTTP request. Safari supports push notifications and **not** local
notifications, so the app cannot arrange its own.

### 4. Periodic Background Sync — not available where it is needed

Chrome-only, never implemented in Safari, and deliberately imprecise about
timing even where it exists. It cannot deliver "07:00 local" and is unavailable
on the target platform regardless.

### 5. Timers in the page or service worker — not viable

`setTimeout` dies when the page closes. A service worker is terminated within
seconds of going idle and is not a background process. Anything built on either
would fire only while the app happened to be open — which is precisely when a
reminder is pointless. **This is the fragile-timer approach the brief rules
out, and it is ruled out here too.**

---

## Conclusion

Reliable delivery at a chosen time, while the app is closed, requires a push
sender: a service that holds each subscription, knows what time to fire, and
makes an HTTP request to Apple's push endpoint at that moment.

There is no local-only path. Anything that appeared to work without one would
be a setting that lies.

---

## If it is ever built: the smallest viable design

Three moving parts, all of which can run on free or near-free tiers.

| Part | Job |
|---|---|
| **Subscription store** | A row per device: the push endpoint, its two keys, the reminder time, and the UTC offset. |
| **Scheduler** | A cron job, once every 15 minutes, selecting rows whose local reminder time has just arrived. |
| **Sender** | Signs a VAPID request per row and posts to the endpoint the browser supplied. |

A single serverless function plus a scheduled trigger plus a small managed
database covers all three. The payload should carry no Scripture at all — just
a nudge and a date. The app already has every reading on the device, so the
notification only needs to say "open me", and the service worker looks up the
day locally. **That keeps the passage selection, the reading history and the
personalisation exactly where they are now.**

### What would have to leave the device

Today, nothing does. That would change to:

- **The push endpoint URL and its two keys.** Unavoidable — it is the address.
  It is a persistent per-install identifier, and whoever holds it can send that
  device notifications until it is revoked.
- **The reminder time and the UTC offset.** A coarse location signal: it
  narrows a user to a band of the globe.
- **Implicitly, an install-level identity.** Rows are per subscription, which
  makes the store a list of people who use this app, with a rough timezone and
  a habit time, held by whoever runs the server.

### What would *not* have to leave

- Private reflections. Never.
- Saved verses.
- The assignment ledger and reading history.
- Focus themes and any other preference.

The notification is a doorbell, not a delivery.

### Privacy consequences worth being honest about

Daily Verse is currently a local-first app with **no backend and no way to
learn anything about anyone**. Adding this changes that category. Even at its
most restrained the server would hold a persistent identifier and an
approximate timezone for every user who turns reminders on. That is a small
amount of data and a real change of kind: there would now be a database that
can be breached, subpoenaed, or sold in an acquisition. There is no version of
this where the answer to "what do you keep about me?" stays "nothing".

Mitigations worth committing to if it goes ahead: store nothing but those four
fields, delete a row the moment a push endpoint returns 404 or 410, offer a
one-tap delete that actually deletes, and never join the table to anything.

### Maintenance and cost

Cost is close to zero at this scale — well inside the free tiers of any of the
usual providers. The real cost is that the project stops being a static site.
It acquires VAPID keys that must be kept secret and must never rotate (rotating
them silently invalidates every existing subscription), an uptime obligation on
a service whose entire job is punctuality, expired-subscription cleanup, and a
second thing to deploy. GitHub Pages needs no attention at all; this would.

### Is it worth it for Daily Verse?

**Probably not yet, and the honest reason is the exchange rate.** The app's
strongest current claim is that it keeps nothing and sends nothing, and that
claim is worth more to a product about someone's private reflections than a
reminder is.

Two things that cost nothing and are worth trying first:

1. **The Home Screen icon is already the reminder.** An installed app sitting
   on a phone gets opened. Many devotional habits run on nothing more.
2. **iOS Shortcuts** can open a URL on a schedule, set up by the user in two
   minutes, with nothing leaving the device and nothing for this project to
   run. It is a worse experience than a real notification and an honest one.

Build the server when there is evidence people are opening the app and then
forgetting — not before. And if it is built, ship it as an explicit opt-in that
says plainly what it sends and where.

---

## Sources

- [Notification Triggers API — Chrome for Developers](https://developer.chrome.com/docs/web-platform/notification-triggers)
  (listed under "No longer pursuing")
- [Using the Notifications API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API)
- [ServiceWorkerRegistration.showNotification() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification)
- [Web Push on iOS, worked example](https://github.com/andreinwald/webpush-ios-example)
- [PWA iOS limitations and Safari support](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
