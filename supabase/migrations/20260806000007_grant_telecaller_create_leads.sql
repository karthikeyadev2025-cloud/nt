/*
  # Grant telecaller create_leads (2026-08-06)

  Confirmed with the account owner: telecallers should be able to add
  leads directly, not just work leads sourced by someone else. The
  previous migration (20260806000006) correctly closed a real gap where
  create_leads wasn't checked at all, but assumed the marketing_executive-
  only default from the seed data reflected the intended workflow — it
  doesn't. This migration is the actual business decision.

  Updates the live role_permissions row for 'telecaller' rather than
  touching individual app_users.permission_overrides, so every current
  and future telecaller gets it, not just whoever happens to have an
  override set today.
*/

UPDATE role_permissions
SET permissions = permissions || '{"create_leads": true}'::jsonb
WHERE role_name = 'telecaller';
