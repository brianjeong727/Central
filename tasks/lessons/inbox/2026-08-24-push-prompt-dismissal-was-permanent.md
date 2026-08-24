## Dismissing the push prompt was a permanent opt-out, with no visible way back (2026-08-24)

**What happened.** Abraham Noh (Central) received no push notifications and could not
find Central under iOS Settings → Notifications at all — the app simply wasn't listed.
His row: `notification_settings = {"prompt_dismissed": true}`, zero `push_subscriptions`.

**Why.** The chat-list "Stay in the loop" card was the only proactive place Central
ever asked for notification permission, and its X wrote `prompt_dismissed: true` —
read as a permanent verdict. One tap, two millimetres from "Turn on notifications",
and the app never asked again.

**Why the OS couldn't help either.** iOS lists an app under Settings → Notifications
only once it has CALLED `requestAuthorization`. Central never asked, so there was
nothing to find. The user's own instinct — "I'll enable it in Settings" — dead-ended
in exactly the same place the app did. This is the part worth remembering: a
never-requested permission is invisible to the user in BOTH directions.

**Why nothing else caught it.** The in-app recovery existed but was three levels down:
Profile → gear (unlabelled) → Notifications → Turn on. And phone width shows the
settings hub as a bare "Notifications ›" row that says nothing about whether push
actually works — no signal anywhere in the app that a member was receiving nothing.
Desktop was fine, because it renders the whole section inline.

**Fix.** A dismissal is "not now", never "never": `prompt_snooze_until` (ISO instant,
14 days) replaces the boolean. A legacy `prompt_dismissed: true` with no snooze is
treated as ALREADY EXPIRED, which un-strands everyone silenced by it with no
migration. The mobile settings-hub row now carries an On/Off value (and stays silent
where push is `supported: false` — nothing to turn on is not the same as "off").

**Rule.** A control that can permanently disable a core channel must either be
reversible from a place the user can find, or must not be permanent. Prefer
not-permanent: a snooze costs one quiet re-ask, a permanent flag costs a user who
never hears from the app again and blames the app.

**Also — `normalize()` is spread wholesale over saved settings on Save.** Any new key
added to `NotificationSettings` MUST be added to its `Omit<>` or the prefs screen
silently overwrites it every time someone flips a toggle. That is how the snooze
would have erased itself.

**Scale.** 16 of ~63 real Central members have any push subscription at all. Only 3
of the rest had dismissed the prompt, so the snooze fixes those three; the other ~44
have never been asked or never granted, which is a separate question worth asking.
