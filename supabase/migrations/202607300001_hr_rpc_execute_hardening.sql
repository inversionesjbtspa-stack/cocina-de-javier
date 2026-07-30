begin;

-- Payroll/accountant RPCs are invoked only by authenticated API routes through the service role.
revoke all on function public.hr_create_payment_batch(uuid, uuid, uuid, text, text, text, text, numeric, jsonb, jsonb) from public;
revoke execute on function public.hr_create_payment_batch(uuid, uuid, uuid, text, text, text, text, numeric, jsonb, jsonb) from anon;
revoke execute on function public.hr_create_payment_batch(uuid, uuid, uuid, text, text, text, text, numeric, jsonb, jsonb) from authenticated;
revoke execute on function public.hr_create_payment_batch(uuid, uuid, uuid, text, text, text, text, numeric, jsonb, jsonb) from service_role;
grant execute on function public.hr_create_payment_batch(uuid, uuid, uuid, text, text, text, text, numeric, jsonb, jsonb) to service_role;

revoke all on function public.hr_upsert_accountant_data_rows(uuid, uuid, uuid, text, jsonb) from public;
revoke execute on function public.hr_upsert_accountant_data_rows(uuid, uuid, uuid, text, jsonb) from anon;
revoke execute on function public.hr_upsert_accountant_data_rows(uuid, uuid, uuid, text, jsonb) from authenticated;
revoke execute on function public.hr_upsert_accountant_data_rows(uuid, uuid, uuid, text, jsonb) from service_role;
grant execute on function public.hr_upsert_accountant_data_rows(uuid, uuid, uuid, text, jsonb) to service_role;

-- Auth-aware vacation RPCs resolve the actor server-side with auth.uid().
revoke all on function public.hr_create_vacation_request(jsonb) from public;
revoke execute on function public.hr_create_vacation_request(jsonb) from anon;
revoke execute on function public.hr_create_vacation_request(jsonb) from authenticated;
revoke execute on function public.hr_create_vacation_request(jsonb) from service_role;
grant execute on function public.hr_create_vacation_request(jsonb) to authenticated, service_role;

revoke all on function public.hr_approve_vacation_request(uuid, integer, text) from public;
revoke execute on function public.hr_approve_vacation_request(uuid, integer, text) from anon;
revoke execute on function public.hr_approve_vacation_request(uuid, integer, text) from authenticated;
revoke execute on function public.hr_approve_vacation_request(uuid, integer, text) from service_role;
grant execute on function public.hr_approve_vacation_request(uuid, integer, text) to authenticated, service_role;

revoke all on function public.hr_cancel_vacation_request(uuid, text) from public;
revoke execute on function public.hr_cancel_vacation_request(uuid, text) from anon;
revoke execute on function public.hr_cancel_vacation_request(uuid, text) from authenticated;
revoke execute on function public.hr_cancel_vacation_request(uuid, text) from service_role;
grant execute on function public.hr_cancel_vacation_request(uuid, text) to authenticated, service_role;

revoke all on function public.hr_reject_vacation_request(uuid, text) from public;
revoke execute on function public.hr_reject_vacation_request(uuid, text) from anon;
revoke execute on function public.hr_reject_vacation_request(uuid, text) from authenticated;
revoke execute on function public.hr_reject_vacation_request(uuid, text) from service_role;
grant execute on function public.hr_reject_vacation_request(uuid, text) to authenticated, service_role;

-- Internal vacation helpers are executable only by the function owner through SECURITY DEFINER call chains.
revoke all on function public.hr_current_vacation_actor() from public;
revoke execute on function public.hr_current_vacation_actor() from anon;
revoke execute on function public.hr_current_vacation_actor() from authenticated;
revoke execute on function public.hr_current_vacation_actor() from service_role;

revoke all on function public.hr_reserve_vacation_days(uuid) from public;
revoke execute on function public.hr_reserve_vacation_days(uuid) from anon;
revoke execute on function public.hr_reserve_vacation_days(uuid) from authenticated;
revoke execute on function public.hr_reserve_vacation_days(uuid) from service_role;

revoke all on function public.hr_reverse_vacation_request(uuid, text) from public;
revoke execute on function public.hr_reverse_vacation_request(uuid, text) from anon;
revoke execute on function public.hr_reverse_vacation_request(uuid, text) from authenticated;
revoke execute on function public.hr_reverse_vacation_request(uuid, text) from service_role;

revoke all on function public.hr_release_vacation_reservations(uuid, text) from public;
revoke execute on function public.hr_release_vacation_reservations(uuid, text) from anon;
revoke execute on function public.hr_release_vacation_reservations(uuid, text) from authenticated;
revoke execute on function public.hr_release_vacation_reservations(uuid, text) from service_role;

revoke all on function public.hr_next_document_number(uuid, text, integer) from public;
revoke execute on function public.hr_next_document_number(uuid, text, integer) from anon;
revoke execute on function public.hr_next_document_number(uuid, text, integer) from authenticated;
revoke execute on function public.hr_next_document_number(uuid, text, integer) from service_role;

revoke all on function public.hr_vacation_calendar_status(uuid, date, date) from public;
revoke execute on function public.hr_vacation_calendar_status(uuid, date, date) from anon;
revoke execute on function public.hr_vacation_calendar_status(uuid, date, date) from authenticated;
revoke execute on function public.hr_vacation_calendar_status(uuid, date, date) from service_role;

revoke all on function public.hr_vacation_has_overlap(uuid, uuid, date, date, uuid) from public;
revoke execute on function public.hr_vacation_has_overlap(uuid, uuid, date, date, uuid) from anon;
revoke execute on function public.hr_vacation_has_overlap(uuid, uuid, date, date, uuid) from authenticated;
revoke execute on function public.hr_vacation_has_overlap(uuid, uuid, date, date, uuid) from service_role;

-- Legacy/manual vacation administration functions are not called by the current app.
revoke all on function public.hr_adjust_vacation_period(text, uuid, uuid, uuid, uuid, numeric, text) from public;
revoke execute on function public.hr_adjust_vacation_period(text, uuid, uuid, uuid, uuid, numeric, text) from anon;
revoke execute on function public.hr_adjust_vacation_period(text, uuid, uuid, uuid, uuid, numeric, text) from authenticated;
revoke execute on function public.hr_adjust_vacation_period(text, uuid, uuid, uuid, uuid, numeric, text) from service_role;

revoke all on function public.hr_accredit_progressive_vacation(text, uuid, uuid, uuid, jsonb) from public;
revoke execute on function public.hr_accredit_progressive_vacation(text, uuid, uuid, uuid, jsonb) from anon;
revoke execute on function public.hr_accredit_progressive_vacation(text, uuid, uuid, uuid, jsonb) from authenticated;
revoke execute on function public.hr_accredit_progressive_vacation(text, uuid, uuid, uuid, jsonb) from service_role;

commit;
