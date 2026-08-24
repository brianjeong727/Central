## Most Central members physically cannot receive notifications, and the app tells them nothing (2026-08-24)

Investigated after fixing the permanent-dismissal bug, because the numbers were far
bigger than one bug explains.

**The numbers (Central, 2026-08-24).** 63 active members. 16 have any push
subscription: **14 on the native iOS app**, 2 web, 1 iOS Home-Screen PWA. Of the 47
without, **44 were active in the app within the last 7 days** — this is not churn.
Only 5 had ever dismissed the subscribe prompt.

**Why.** Apple does not expose `PushManager` to ordinary mobile Safari. Web Push on
iOS requires either the native app or a Home-Screen-installed PWA. So for a member
browsing joincentral.app in Safari, `pushSupported()` is correctly false, the
chat-list subscribe card correctly never renders, and Profile → Notifications
correctly reports "Not supported". Everything behaves exactly as designed and the
member cannot receive a single notification.

**What makes it the app's fault rather than Apple's.** Nothing anywhere in the
product mentions that a native iOS app exists — no App Store link on the landing
page, in Profile, in onboarding, or beside the notification row. The one surface
that touches the subject says *"This browser doesn't support push notifications"*:
true, terminal, and unactionable. A member who wants notifications, goes looking,
and finds that message has been told the problem is their browser and given no next
step. ~49 of 63 members are in that position.

**The lesson.** An "unsupported" state is not a valid resting place for a core
channel. Wherever a capability is unavailable for a platform reason, the copy must
carry the ONE action that makes it available ("Get Central from the App Store" /
"Add to Home Screen"), or the feature is effectively off for everyone outside the
happy path and the product has no way of knowing.

**Fixed (the copy only, by Brian's call).** The notifications row on an iPhone
browser now reads "Not available in Safari / iPhone only sends notifications to
installed apps." with a link to the real listing, and the phone-width settings hub
marks that row "Off" so it is findable at all. Scoped deliberately: a desktop browser
without push still gets the plain message, because there is no app to send that
person to.

**The App Store id is not recorded anywhere in the repo** and must not be guessed.
`https://apps.apple.com/us/app/central-os/id6791196078` — resolved from the Capacitor
bundle id via Apple's public lookup:
`curl "https://itunes.apple.com/lookup?bundleId=app.joincentral"`. Worth knowing the
next time something needs to link to the app.

**Still open** — how loudly to promote the app to the ~49 members who have never been
told it exists (a banner, the landing page, onboarding) is a distribution decision, not
a bug fix. Only the dead-end copy was in scope.
