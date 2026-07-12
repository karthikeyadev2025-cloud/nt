/*
  # Public ticket tracking
  A customer who raised a support ticket anonymously (no login) previously had
  no way to check its status without calling in. This RPC requires BOTH the
  exact ticket number AND phone number to match — not a raw SELECT policy —
  so a stranger can't enumerate/browse other customers' tickets by guessing
  ticket numbers.
*/
CREATE OR REPLACE FUNCTION track_ticket(_ticket_no text, _phone text)
RETURNS TABLE (
  ticket_no text, subject text, status text, priority text,
  created_at timestamptz, updated_at timestamptz, resolved_at timestamptz
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT t.ticket_no, t.subject, t.status, t.priority, t.created_at, t.updated_at, t.resolved_at
  FROM support_tickets t
  WHERE t.ticket_no = _ticket_no AND t.customer_phone = _phone;
$$;
GRANT EXECUTE ON FUNCTION track_ticket(text, text) TO anon, authenticated;
