-- ─── Migration: Chat Settings ────────────────────────────────────────────────
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query).

-- ─── 1. Add archived column to groups ────────────────────────────────────────
ALTER TABLE groups ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;

-- ─── 2. Update group UPDATE policy ───────────────────────────────────────────
-- Allow: creator, admin/leader (for church chats), any member (for my/dm chats)
DROP POLICY IF EXISTS "Creator can update their group" ON groups;

CREATE POLICY "Members can update their groups"
ON groups FOR UPDATE
USING (
  -- Creator can always update their own groups
  created_by = auth.uid()
  OR (
    -- Must be a member of the group
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = groups.id
        AND group_members.user_id = auth.uid()
    )
    AND (
      -- Non-church groups: any member can update
      type != 'church'
      -- Church groups: must be admin or leader
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('admin', 'leader')
      )
    )
  )
);

-- ─── 3. Allow members to delete group_members rows (leave / remove) ──────────
CREATE POLICY "Members can remove from their groups"
ON group_members FOR DELETE
USING (
  -- Any user can remove themselves (leave)
  user_id = auth.uid()
  -- Any member can remove others from non-church groups
  OR EXISTS (
    SELECT 1 FROM group_members gm2
    JOIN groups g ON g.id = gm2.group_id
    WHERE gm2.group_id = group_members.group_id
      AND gm2.user_id = auth.uid()
      AND g.type != 'church'
  )
  -- Admin/leader members can remove from church groups
  OR (
    EXISTS (
      SELECT 1 FROM group_members gm2
      WHERE gm2.group_id = group_members.group_id
        AND gm2.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'leader')
    )
  )
);
