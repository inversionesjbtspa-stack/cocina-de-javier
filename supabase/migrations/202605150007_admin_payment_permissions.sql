-- Admin role must operate treasury and payment workflows end to end.

insert into public.role_permissions (role, permission_code)
values
  ('admin', 'payments.approve'),
  ('admin', 'payments.generate_file')
on conflict (role, permission_code) do nothing;
