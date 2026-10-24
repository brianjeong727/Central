// central-rules.mjs — CLAUDE.md conventions that a syntax tree can check.
//
// Each rule mechanizes one numbered convention, so the prose in CLAUDE.md can
// shrink to a line naming the check. Scoping (which files a rule applies to,
// which files are its sanctioned exceptions) lives in eslint.config.mjs, not
// here, so every exemption is visible in one place.
//
// A genuine nonconformer is silenced AT THE SITE with a reason, which is what
// the conventions already ask for ("document why at the site"):
//   // eslint-disable-next-line central/no-inline-role-array -- UI role picker enum

const ROLES = new Set(["visitor", "member", "leader", "admin", "deacon", "elder", "pastor"])

const stringValue = (node) =>
  node?.type === "Literal" && typeof node.value === "string"
    ? node.value
    : node?.type === "TemplateLiteral" && node.expressions.length === 0
      ? node.quasis[0].value.cooked
      : null

// An array of two or more role names and nothing else — the shape of an inline
// gate. A mixed list (["all", "admin", …] filter chips, ["member"] URL params) is
// not one, and flagging it would train people to reach for the disable comment.
const roleList = (array) => {
  const values = array.elements.map(stringValue)
  return values.length >= 2 && values.every((v) => v !== null && ROLES.has(v)) ? values : null
}

// Only a comparison against something role-shaped (`role`, `m.role`,
// `userRole.toLowerCase()`) is a role check; `copied === "member"` is not.
const looksLikeRole = (context, node) => /role/i.test(context.sourceCode.getText(node))

// ── #2 Role checks go through lib/roles.ts — never inline role arrays ──────────
const noInlineRoleArray = {
  meta: {
    type: "problem",
    messages: {
      inline:
        "Convention #2: role gating goes through lib/roles.ts (isAdminRole, isLeaderRole, isStaffRole, isMemberTier, …) — not an inline role array. A genuine nonconformer gets an eslint-disable comment saying why.",
    },
  },
  create(context) {
    return {
      ArrayExpression(node) {
        if (roleList(node)) context.report({ node, messageId: "inline" })
      },
    }
  },
}

// ── #3 Visitor parity ─────────────────────────────────────────────────────────
const visitorParity = {
  meta: {
    type: "problem",
    messages: {
      compare:
        'Convention #3: `role === "member"` drops visitors — use isMemberTier(role) from lib/roles.ts.',
      list: 'Convention #3: a role list that includes "member" must include "visitor".',
    },
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (!["===", "!==", "==", "!="].includes(node.operator)) return
        const other =
          stringValue(node.left) === "member" ? node.right
          : stringValue(node.right) === "member" ? node.left
          : null
        if (other && looksLikeRole(context, other)) context.report({ node, messageId: "compare" })
      },
      ArrayExpression(node) {
        const roles = roleList(node)
        if (roles && roles.includes("member") && !roles.includes("visitor")) {
          context.report({ node, messageId: "list" })
        }
      },
    }
  },
}

// ── #14 "Register your ministry" CTAs route to /register-ministry ─────────────
const REGISTER_BYPASS = /^\/(signup\?(.*&)?intent=register\b|onboarding\b)/
const registerCta = {
  meta: {
    type: "problem",
    messages: {
      bypass:
        "Convention #14: link to /register-ministry, not {{href}} — the proxy bounces signed-in users off /signup, and /register-ministry routes by auth state.",
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.name !== "href" || !node.value) return
        const v =
          node.value.type === "JSXExpressionContainer" ? node.value.expression : node.value
        const href = stringValue(v)
        if (href && REGISTER_BYPASS.test(href)) {
          context.report({ node, messageId: "bypass", data: { href } })
        }
      },
    }
  },
}

// ── #20 Every dropdown/kebab uses ActionMenu ─────────────────────────────────
const MENU_MODULE = /(^|\/)(react-)?(dropdown-menu|context-menu|menubar)$/
const MENU_EXPORTS = new Set(["DropdownMenu", "ContextMenu", "Menubar"])
const actionMenuOnly = {
  meta: {
    type: "problem",
    messages: {
      menu: "Convention #20: menus render through ActionMenu (components/central/action-menu.tsx) — it portals, flips and clamps. Don't build one from {{what}}.",
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const src = node.source.value
        if (MENU_MODULE.test(src)) {
          context.report({ node, messageId: "menu", data: { what: src } })
          return
        }
        if (src !== "radix-ui") return
        for (const s of node.specifiers) {
          if (s.type === "ImportSpecifier" && MENU_EXPORTS.has(s.imported.name)) {
            context.report({ node: s, messageId: "menu", data: { what: `radix-ui ${s.imported.name}` } })
          }
        }
      },
    }
  },
}

// ── #28 Keyboard layout goes through lib/keyboard-inset.ts ───────────────────
const keyboardInset = {
  meta: {
    type: "problem",
    messages: {
      plugin:
        "Convention #28: only lib/keyboard-inset.ts talks to @capacitor/keyboard — read --kb-inset / [data-kb-open] or subscribeKeyboard instead.",
      native:
        'Convention #28: never resize "native" — the plugin defers its WebView resize and the composer sits behind the keyboard.',
    },
  },
  create(context) {
    const filename = context.filename.replace(/\\/g, "/")
    const pluginAllowed =
      filename.endsWith("/lib/keyboard-inset.ts") || filename.endsWith("/capacitor.config.ts")
    const checkSource = (node, src) => {
      if (!pluginAllowed && stringValue(src) === "@capacitor/keyboard") {
        context.report({ node, messageId: "plugin" })
      }
    }
    return {
      ImportDeclaration: (node) => checkSource(node, node.source),
      ImportExpression: (node) => checkSource(node, node.source),
      MemberExpression(node) {
        if (
          node.object.type === "Identifier" &&
          node.object.name === "KeyboardResize" &&
          node.property.type === "Identifier" &&
          node.property.name === "Native"
        ) {
          context.report({ node, messageId: "native" })
        }
      },
      Property(node) {
        const key = node.key.type === "Identifier" ? node.key.name : stringValue(node.key)
        if (key === "resize" && stringValue(node.value) === "native") {
          context.report({ node, messageId: "native" })
        }
      },
    }
  },
}

// ── #29 The call start gate is can_start_call, never its JWT wrapper ──────────
const callStartGate = {
  meta: {
    type: "problem",
    messages: {
      jwt: "Convention #29: auth_can_start_call() is the JWT wrapper and returns false on a service-role connection — rpc can_start_call(group, user) instead.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee
        if (
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          callee.property.name === "rpc" &&
          stringValue(node.arguments[0]) === "auth_can_start_call"
        ) {
          context.report({ node, messageId: "jwt" })
        }
      },
    }
  },
}

const central = {
  meta: { name: "central" },
  rules: {
    "no-inline-role-array": noInlineRoleArray,
    "visitor-parity": visitorParity,
    "register-cta": registerCta,
    "action-menu-only": actionMenuOnly,
    "keyboard-inset": keyboardInset,
    "call-start-gate": callStartGate,
  },
}

export default central
