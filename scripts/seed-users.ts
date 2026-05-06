import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import * as path from "path"

dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PASSWORD = process.env.SEED_USER_PASSWORD

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("\n❌  Missing env vars. Add to .env.local:\n")
  console.error("  NEXT_PUBLIC_SUPABASE_URL=<your project URL>\n")
  console.error("  SUPABASE_SERVICE_ROLE_KEY=<your service role key>\n")
  console.error("Find the service role key in Supabase Dashboard → Project Settings → API\n")
  process.exit(1)
}

if (!PASSWORD) {
  console.error("\n❌  Missing SEED_USER_PASSWORD. Add to .env.local (dev only):\n")
  console.error("  SEED_USER_PASSWORD=<password for seeded test users>\n")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const USERS = [
  {
    name: "James Park",
    email: "jamespark@test.com",
    grad: 2025,
    about_me: "Senior studying Computer Science at Pitt. Love late-night coding sessions and really good ramen. Faith has been the anchor through a busy senior year.",
    bible_verse: "Philippians 4:13 — I can do all things through Christ who strengthens me.",
    prayer_request: "Wisdom as I navigate job offers and figure out post-graduation next steps.",
    pray_for_me: "That I would trust God's timing rather than my own plan.",
  },
  {
    name: "Sofia Reyes",
    email: "sofiareyes@test.com",
    grad: 2025,
    about_me: "Nursing major who grew up in a big Latino family in Miami. I love salsa dancing, cooking, and spending Sunday mornings in worship.",
    bible_verse: "Jeremiah 29:11 — For I know the plans I have for you, declares the Lord.",
    prayer_request: "Passing my NCLEX boards and getting placed at a hospital I love.",
    pray_for_me: "Peace and confidence as I prepare for my final clinical rotations.",
  },
  {
    name: "Marcus Johnson",
    email: "marcusjohnson@test.com",
    grad: 2025,
    about_me: "Econ major and pickup basketball enthusiast. Originally from Atlanta. I came to faith freshman year and it completely changed how I see community.",
    bible_verse: "Micah 6:8 — Act justly, love mercy, and walk humbly with your God.",
    prayer_request: "Direction on whether to pursue grad school or go straight into work.",
    pray_for_me: "That I would stay rooted and not drift when life gets busy and complicated.",
  },
  {
    name: "Hannah Kim",
    email: "hannahkim@test.com",
    grad: 2025,
    about_me: "Psychology major, third-generation Korean-American. I love journaling, thrifting, and hosting people in my apartment. Community is everything to me.",
    bible_verse: "Romans 8:28 — All things work together for good for those who love God.",
    prayer_request: "Healing and clarity in a family relationship that has been strained for a while.",
    pray_for_me: "Courage to have hard conversations with grace instead of avoiding them.",
  },
  {
    name: "David Chen",
    email: "davidchen@test.com",
    grad: 2025,
    about_me: "Mechanical engineering student and amateur photographer. I take film photos on weekends and spend way too much at coffee shops reading theology books.",
    bible_verse: "Proverbs 3:5-6 — Trust in the Lord with all your heart and lean not on your own understanding.",
    prayer_request: "A smooth final semester and that my senior design project actually works.",
    pray_for_me: "That I wouldn't find my identity in my GPA and would rest in who God says I am.",
  },
  {
    name: "Priya Patel",
    email: "priyapatel@test.com",
    grad: 2026,
    about_me: "Pre-med junior from New Jersey. I love hiking, chai, and anything to do with music. Exploring faith in a season of lots of questions — grateful for this community.",
    bible_verse: "Isaiah 40:31 — Those who hope in the Lord will renew their strength.",
    prayer_request: "Stamina through MCAT prep and maintaining a healthy rhythm this semester.",
    pray_for_me: "That I would find joy in the journey and not just the destination.",
  },
  {
    name: "Elijah Brooks",
    email: "elijahbrooks@test.com",
    grad: 2026,
    about_me: "Urban studies and political science double major. Passionate about housing justice and community development. I play bass on the worship team.",
    bible_verse: "Amos 5:24 — Let justice roll on like a river, righteousness like a never-failing stream.",
    prayer_request: "Discernment on a summer internship in DC with a nonprofit housing organization.",
    pray_for_me: "That my passion for justice would stay rooted in love and not burn into cynicism.",
  },
  {
    name: "Chloe Martinez",
    email: "chloemartinez@test.com",
    grad: 2026,
    about_me: "Graphic design junior who loves illustrated Bibles, matcha, and making things beautiful. Grew up in the church but have been rediscovering faith on my own terms.",
    bible_verse: "Psalm 34:8 — Taste and see that the Lord is good.",
    prayer_request: "Creative breakthrough on a large design project that has me stuck.",
    pray_for_me: "That I would use my gifts for God's glory and not just personal validation.",
  },
  {
    name: "Noah Thompson",
    email: "noahthompson@test.com",
    grad: 2026,
    about_me: "Finance major from Ohio. I love cooking elaborate meals for no reason, playing chess, and going to church. Trying to be intentional about building real community this year.",
    bible_verse: "Matthew 6:33 — Seek first his kingdom and his righteousness, and all these will be given to you.",
    prayer_request: "Contentment and focus — I've been distracted and scattered lately.",
    pray_for_me: "That I would be present in relationships and stop rushing through every moment.",
  },
  {
    name: "Aaliyah Washington",
    email: "aaliyahwashington@test.com",
    grad: 2026,
    about_me: "Social work junior from Pittsburgh. I advocate for kids in the foster care system through a local nonprofit. Faith keeps me from burning out.",
    bible_verse: "Matthew 25:40 — Whatever you did for one of the least of these brothers of mine, you did for me.",
    prayer_request: "Strength and wisdom as I work with a family going through a really hard custody case.",
    pray_for_me: "That I would have sustainable compassion and receive care as well as give it.",
  },
  {
    name: "Caleb Lee",
    email: "caleblee@test.com",
    grad: 2027,
    about_me: "Sophomore studying biochem, originally from San Diego. Surfer at heart, now landlocked and coping. I love deep conversations, terrible puns, and exploring Pittsburgh.",
    bible_verse: "John 16:33 — In this world you will have trouble. But take heart! I have overcome the world.",
    prayer_request: "Doing well in orgo and keeping my mental health in a healthy place.",
    pray_for_me: "That I would lean on God and community when I struggle instead of isolating.",
  },
  {
    name: "Grace Wu",
    email: "gracewu@test.com",
    grad: 2027,
    about_me: "Music and biology double major — yes, really. I sing, play violin, and somehow still sleep. I'm passionate about medicine and want to work with underserved communities one day.",
    bible_verse: "Colossians 3:23 — Whatever you do, work at it with all your heart, as working for the Lord.",
    prayer_request: "Balance — I keep overcommitting and need wisdom on where to pull back.",
    pray_for_me: "Rest and clarity about my calling as I hold music and medicine together.",
  },
  {
    name: "Isaiah Rivera",
    email: "isaiahrivera@test.com",
    grad: 2027,
    about_me: "Sophomore from Chicago studying journalism. I love storytelling, spoken word poetry, and long walks. Grew up in a Puerto Rican Pentecostal church — worship is in my blood.",
    bible_verse: "Habakkuk 2:2 — Write down the revelation and make it plain on tablets so that whoever reads it may run.",
    prayer_request: "Boldness in sharing my faith through my writing and not just within church walls.",
    pray_for_me: "That I would not shrink my voice trying to fit into spaces that weren't built for me.",
  },
  {
    name: "Mia Nguyen",
    email: "mianguyen@test.com",
    grad: 2027,
    about_me: "Sophomore studying international relations. Vietnamese-American, grew up in Houston. I love boba, K-dramas, and asking questions that make people uncomfortable (in a good way).",
    bible_verse: "1 Peter 3:15 — Always be prepared to give an answer to everyone who asks you to give the reason for the hope that you have.",
    prayer_request: "Navigating the tension between my family's expectations and the path I feel called to.",
    pray_for_me: "Courage to have honest conversations with my parents about faith and my future.",
  },
  {
    name: "Ethan Scott",
    email: "ethanscott@test.com",
    grad: 2027,
    about_me: "Civil engineering sophomore who loves the outdoors, coffee, and college football way too much. I came to faith at a summer camp two years ago and haven't looked back.",
    bible_verse: "Joshua 1:9 — Be strong and courageous. Do not be afraid; do not be discouraged.",
    prayer_request: "Growth in discipline — I want my daily habits to actually reflect my values.",
    pray_for_me: "That I would pursue depth in my faith and not just attend events and call it community.",
  },
  {
    name: "Zoe Adams",
    email: "zoeadams@test.com",
    grad: 2028,
    about_me: "Freshman from Nashville studying communications. I grew up in a Christian family but I'm discovering what my own faith looks like. Big fan of sunsets, live music, and good friends.",
    bible_verse: "Psalm 46:10 — Be still, and know that I am God.",
    prayer_request: "Adjusting to college life and finding real, meaningful friendships quickly.",
    pray_for_me: "That I would feel at home here and not let homesickness close me off.",
  },
  {
    name: "Jordan Taylor",
    email: "jordantaylor@test.com",
    grad: 2028,
    about_me: "Freshman undecided major from Cleveland. I run track, love anime, and have been reading the Bible consistently for the first time in my life this year.",
    bible_verse: "Hebrews 12:1 — Let us run with perseverance the race marked out for us.",
    prayer_request: "Wisdom choosing a major that actually fits who God made me to be.",
    pray_for_me: "That I would not let comparison steal my joy as I figure out my direction.",
  },
  {
    name: "Leah Mitchell",
    email: "leahmitchell@test.com",
    grad: 2028,
    about_me: "Freshman studying education — I want to teach elementary school in an underserved district. I love kids, reading, and making people feel seen and known.",
    bible_verse: "Isaiah 58:10 — If you spend yourselves in behalf of the hungry and satisfy the needs of the oppressed, then your light will rise.",
    prayer_request: "Staying grounded academically and emotionally during the adjustment to college.",
    pray_for_me: "That I would give generously of my time and energy without depleting myself.",
  },
  {
    name: "Brandon Harris",
    email: "brandonharris@test.com",
    grad: 2028,
    about_me: "Freshman from Baltimore studying business. I love entrepreneurship, sneakers, and my family. The church has been a huge part of my life — glad to find community at Pitt.",
    bible_verse: "Proverbs 16:3 — Commit to the Lord whatever you do, and he will establish your plans.",
    prayer_request: "Focus and discipline as I start college — I want to finish strong, not just start.",
    pray_for_me: "That I would use my ambition for good and stay humble as I grow.",
  },
  {
    name: "Natalie White",
    email: "nataliewhite@test.com",
    grad: 2028,
    about_me: "Freshman studying environmental science. I love hiking, painting, and advocacy work. My faith and my love for creation go hand in hand.",
    bible_verse: "Genesis 2:15 — The Lord God took the man and put him in the Garden of Eden to work it and take care of it.",
    prayer_request: "Finding a research opportunity this semester and connecting with people who care about the same things I do.",
    pray_for_me: "That I would see God's fingerprints in nature and in the people I meet this year.",
  },
]

async function main() {
  console.log("\n🌱  Seeding 20 test users into Central...\n")

  // Find the Central ministry
  const { data: ministry, error: ministryErr } = await supabase
    .from("ministries")
    .select("id, name")
    .eq("name", "Central")
    .single()

  if (ministryErr || !ministry) {
    console.error('❌  Could not find ministry named "Central":', ministryErr?.message)
    process.exit(1)
  }

  console.log(`✅  Found ministry: ${ministry.name} (${ministry.id})\n`)

  const results: { name: string; email: string; status: "created" | "skipped" | "error"; note?: string }[] = []

  for (const u of USERS) {
    // Create auth user via admin API (bypasses RLS, auto-confirms email)
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: u.name },
    })

    if (createErr) {
      const msg = createErr.message.toLowerCase()
      if (msg.includes("already") || msg.includes("exists") || msg.includes("duplicate")) {
        console.log(`⏭️   Skipped  ${u.name} (${u.email}) — already exists`)
        results.push({ name: u.name, email: u.email, status: "skipped" })
        continue
      }
      console.error(`❌  Error    ${u.name}: ${createErr.message}`)
      results.push({ name: u.name, email: u.email, status: "error", note: createErr.message })
      continue
    }

    const uid = created.user?.id
    if (!uid) {
      console.error(`❌  No user ID returned for ${u.name}`)
      results.push({ name: u.name, email: u.email, status: "error", note: "no user id" })
      continue
    }

    // Update the auto-created profile row (handle_new_user trigger creates it with null ministry_id)
    const { error: profileErr } = await supabase
      .from("profiles")
      .update({
        ministry_id: ministry.id,
        name: u.name,
        email: u.email,
        graduation_year: u.grad,
        role: "member",
        about_me: u.about_me,
        bible_verse: u.bible_verse,
        prayer_request: u.prayer_request,
        pray_for_me: u.pray_for_me,
      })
      .eq("id", uid)

    if (profileErr) {
      console.error(`⚠️   Created auth user but profile update failed for ${u.name}: ${profileErr.message}`)
      results.push({ name: u.name, email: u.email, status: "created", note: `profile error: ${profileErr.message}` })
    } else {
      console.log(`✅  Created  ${u.name} (${u.email}) — Class of ${u.grad}`)
      results.push({ name: u.name, email: u.email, status: "created" })
    }
  }

  // Summary
  const created = results.filter((r) => r.status === "created")
  const skipped = results.filter((r) => r.status === "skipped")
  const errors = results.filter((r) => r.status === "error")

  console.log(`\n${"─".repeat(60)}`)
  console.log(`  ${created.length} created  ·  ${skipped.length} skipped  ·  ${errors.length} errors`)
  console.log(`${"─".repeat(60)}\n`)

  // Login reference
  console.log("LOGIN REFERENCE")
  console.log("─".repeat(60))
  const colW = 24
  for (const u of USERS) {
    console.log(`${u.name.padEnd(colW)}${u.email.padEnd(32)}${PASSWORD}`)
  }
  console.log("─".repeat(60))
  console.log(`Password for all users: ${PASSWORD}\n`)
}

main().catch((err) => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
