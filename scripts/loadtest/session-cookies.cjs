// Forge the EXACT Supabase SSR session cookies the app's middleware + server
// components expect, so http-burst can hit an AUTHENTICATED /home render.
//
// We do NOT hand-roll the cookie format (name, `base64-` prefix, chunking at
// MAX_CHUNK_SIZE all changed across @supabase/ssr versions). Instead we drive the
// REAL createServerClient with an in-memory cookie jar and harvest whatever it
// writes on signInWithPassword — so this stays correct across library upgrades.
//
// Deliberately NOT forging `central-mw` (proxy.ts's signed routing-cache cookie):
// its absence forces the middleware's cache-MISS path — getUser() + the joined
// profiles×ministries query. That is the EXPENSIVE path and the one worth loading.
const { createServerClient } = require("@supabase/ssr")
const { loadEnv } = require("./lib.cjs")

// Build a Cookie: header for one user by performing a real SSR sign-in.
async function cookieHeaderFor(email, password) {
  loadEnv()
  const jar = new Map()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return [...jar.entries()].map(([name, value]) => ({ name, value }))
        },
        setAll(list) {
          for (const { name, value } of list) {
            if (value === "") jar.delete(name)
            else jar.set(name, value)
          }
        },
      },
    }
  )
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`${email}: ${error.message}`)
  if (!jar.size) throw new Error(`${email}: sign-in set no cookies`)
  return {
    header: [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; "),
    userId: data.user.id,
    names: [...jar.keys()],
  }
}

// Warm N authenticated browser-shaped sessions, paced to respect the auth rate limit.
async function warmCookieSessions(emails, password, paceMs = 350) {
  const out = []
  for (const email of emails) {
    try {
      out.push({ email, ...(await cookieHeaderFor(email, password)) })
    } catch (e) {
      console.error(`[cookies] ${e.message}`)
    }
    await new Promise((r) => setTimeout(r, paceMs))
  }
  return out
}

module.exports = { cookieHeaderFor, warmCookieSessions }

// Self-test:  node scripts/loadtest/session-cookies.cjs [email]
if (require.main === module) {
  ;(async () => {
    loadEnv()
    const email = process.argv[2] || "fleet001@loadtest.test"
    const { header, userId, names } = await cookieHeaderFor(email, process.env.E2E_PASSWORD)
    console.log(`cookies for ${email} (${userId}):`, names.join(", "))
    const t0 = Date.now()
    const res = await fetch("https://www.joincentral.app/home", {
      headers: { cookie: header, "user-agent": "central-loadtest/1.0" },
      redirect: "manual",
    })
    const body = res.status === 200 ? await res.text() : ""
    console.log(`GET /home -> ${res.status} in ${Date.now() - t0}ms, ${body.length} bytes`)
    if (res.status !== 200) console.log("location:", res.headers.get("location"))
    // A real authenticated shell render should contain app chrome, not the login page.
    if (body) console.log("authenticated?", !/Sign in|Log in to Central/i.test(body.slice(0, 4000)))
  })().catch((e) => { console.error("FATAL", e.message); process.exit(1) })
}
