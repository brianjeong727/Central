## A viewer-scoped RPC can IGNORE the `p_user_id` you pass it (2026-08-24)

`get_chat_list(p_user_id, p_ministry_id)` and `get_chat_previews` are SECURITY
DEFINER and still take a `p_user_id` — but the body reads
`select auth.uid() as uid` and the argument is dead weight kept for signature
compatibility ("structural, not granted: no session → no rows", finding A1).

Called from a service-role client, `auth.uid()` is null, so they return an EMPTY
SET no matter what you pass. `account-deletion.spec.ts` had been asserting DM
titles through `box.client.rpc("get_chat_list", { p_user_id: adminId, ... })`
since before the A1 change; from that point on the assertion could only ever
fail, and the failure message ("did not return the DM") reads like a product
regression rather than a harness bug. The block immediately below it in the same
test already did the right thing — mint the admin's JWT and raw-fetch the RPC —
with a comment explaining why. The two blocks disagreed and nobody noticed.

**Rules.**
- A function signature is not the contract. Before asserting through an RPC,
  read `pg_get_functiondef` and find out where it gets the VIEWER from. If the
  body says `auth.uid()`, an argument named `p_user_id` is a lie.
- Any viewer-scoped RPC in a spec is called with a real session token, never the
  service-role client — even when it is SECURITY DEFINER and even when it accepts
  the user id as a parameter.
- When two assertions in the SAME test reach the same class of function two
  different ways, one of them is wrong. Make them share a helper (`asAdmin`) so
  they cannot drift again.

Related: the `revoke … from public` / `DROP+CREATE re-grants anon` entries — same
family, where the SQL surface's real behaviour differs from what its declaration
suggests.
