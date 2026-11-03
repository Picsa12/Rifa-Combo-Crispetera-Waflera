-- RIFA CRISPETERA 00-99
-- Ejecutar completo en Supabase > SQL Editor.
-- Diseñado para una sola rifa. Los registros públicos se hacen mediante RPC.
create extension if not exists pgcrypto;

create table if not exists public.raffle_settings (
  id integer primary key default 1 check (id = 1),
  title text not null default 'Rifa de la Crispetera',
  prize text not null default 'Crispetera',
  draw_date date not null default date '2026-11-14',
  price integer not null default 5000 check (price > 0),
  updated_at timestamptz not null default now()
);
insert into public.raffle_settings(id) values (1) on conflict (id) do nothing;

create table if not exists public.raffle_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.raffle_requests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name text not null check (length(trim(last_name)) between 1 and 80),
  phone text not null check (length(trim(phone)) between 7 and 20),
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  total_amount integer not null check (total_amount >= 0),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  rejection_reason text
);

create table if not exists public.raffle_numbers (
  number smallint primary key check (number between 0 and 99),
  status text not null default 'available' check (status in ('available','pending','confirmed')),
  request_id uuid references public.raffle_requests(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.raffle_numbers(number)
select generate_series(0,99)
on conflict (number) do nothing;

create table if not exists public.raffle_request_numbers (
  request_id uuid not null references public.raffle_requests(id) on delete cascade,
  number smallint not null references public.raffle_numbers(number),
  primary key(request_id, number),
  unique(number)
);

create index if not exists raffle_requests_status_created_idx on public.raffle_requests(status, created_at desc);
create index if not exists raffle_numbers_status_idx on public.raffle_numbers(status);

create or replace function public.is_raffle_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.raffle_admins where user_id = auth.uid()); $$;

-- Resumen público: no expone el teléfono. El visitante ve nombre, apellido,
-- números relacionados y fecha de solicitud.
create or replace function public.public_participant_summary()
returns table(first_name text,last_name text,numbers smallint[],created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select r.first_name, r.last_name,
         array_agg(rn.number order by rn.number)::smallint[],
         r.created_at
  from public.raffle_requests r
  join public.raffle_request_numbers rn on rn.request_id = r.id
  where r.status in ('pending','confirmed')
  group by r.id, r.first_name, r.last_name, r.created_at;
$$;

-- Registro atómico: si un número ya no está libre, falla toda la solicitud.
create or replace function public.create_raffle_request(
  p_first_name text,p_last_name text,p_phone text,p_numbers integer[]
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_price integer; v_count integer;
begin
  if length(trim(coalesce(p_first_name,''))) not between 1 and 80
     or length(trim(coalesce(p_last_name,''))) not between 1 and 80
     or length(trim(coalesce(p_phone,''))) not between 7 and 20 then
    raise exception 'Verifica nombre, apellido y celular.';
  end if;
  if p_numbers is null or cardinality(p_numbers) < 1 or cardinality(p_numbers) > 100 then
    raise exception 'Selecciona al menos un número.';
  end if;
  if (select count(distinct x) from unnest(p_numbers) x) <> cardinality(p_numbers)
     or exists(select 1 from unnest(p_numbers) x where x < 0 or x > 99) then
    raise exception 'La selección contiene números inválidos o repetidos.';
  end if;
  select price into v_price from public.raffle_settings where id=1;
  -- Bloqueo de filas en orden para evitar reservas simultáneas inconsistentes.
  perform 1 from public.raffle_numbers
   where number = any(p_numbers::smallint[]) and status='available'
   order by number for update;
  select count(*) into v_count from public.raffle_numbers
   where number = any(p_numbers::smallint[]) and status='available';
  if v_count <> cardinality(p_numbers) then
    raise exception 'Uno o más números ya no están disponibles. Actualiza el cartón.';
  end if;
  insert into public.raffle_requests(first_name,last_name,phone,total_amount)
  values(trim(p_first_name),trim(p_last_name),trim(p_phone),v_price*cardinality(p_numbers))
  returning id into v_id;
  insert into public.raffle_request_numbers(request_id,number)
  select v_id,x::smallint from unnest(p_numbers) x;
  update public.raffle_numbers set status='pending',request_id=v_id,updated_at=now()
   where number = any(p_numbers::smallint[]);
  return v_id;
end;
$$;

create or replace function public.approve_raffle_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_status text; v_count integer;
begin
  if not public.is_raffle_admin() then raise exception 'No autorizado.'; end if;
  select status into v_status from public.raffle_requests where id=p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada.'; end if;
  if v_status <> 'pending' then raise exception 'La solicitud ya fue procesada.'; end if;
  select count(*) into v_count from public.raffle_request_numbers where request_id=p_request_id;
  if v_count=0 then raise exception 'La solicitud no tiene números asociados.'; end if;
  update public.raffle_requests set status='confirmed',reviewed_at=now(),reviewed_by=auth.uid()
   where id=p_request_id;
  update public.raffle_numbers set status='confirmed',updated_at=now()
   where request_id=p_request_id and status='pending';
end;
$$;

create or replace function public.reject_raffle_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
  if not public.is_raffle_admin() then raise exception 'No autorizado.'; end if;
  select status into v_status from public.raffle_requests where id=p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada.'; end if;
  if v_status <> 'pending' then raise exception 'La solicitud ya fue procesada.'; end if;
  update public.raffle_requests set status='rejected',reviewed_at=now(),reviewed_by=auth.uid()
   where id=p_request_id;
  update public.raffle_numbers set status='available',request_id=null,updated_at=now()
   where request_id=p_request_id and status='pending';
end;
$$;

create or replace function public.update_raffle_settings(
  p_title text,p_prize text,p_draw_date date,p_price integer
) returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_raffle_admin() then raise exception 'No autorizado.'; end if;
  if length(trim(p_title)) not between 1 and 100 or length(trim(p_prize)) not between 1 and 120
     or p_draw_date is null or p_price < 1 then raise exception 'Configuración inválida.'; end if;
  update public.raffle_settings set title=trim(p_title),prize=trim(p_prize),
    draw_date=p_draw_date,price=p_price,updated_at=now() where id=1;
end;
$$;

alter table public.raffle_settings enable row level security;
alter table public.raffle_admins enable row level security;
alter table public.raffle_requests enable row level security;
alter table public.raffle_numbers enable row level security;
alter table public.raffle_request_numbers enable row level security;

-- Lectura pública únicamente de configuración y estado de números.
drop policy if exists "public read settings" on public.raffle_settings;
create policy "public read settings" on public.raffle_settings for select to anon,authenticated using (true);
drop policy if exists "public read number status" on public.raffle_numbers;
create policy "public read number status" on public.raffle_numbers for select to anon,authenticated using (true);

-- Lectura de datos personales sólo por administradores.
drop policy if exists "admins read requests" on public.raffle_requests;
create policy "admins read requests" on public.raffle_requests for select to authenticated using (public.is_raffle_admin());
drop policy if exists "admins read request numbers" on public.raffle_request_numbers;
create policy "admins read request numbers" on public.raffle_request_numbers for select to authenticated using (public.is_raffle_admin());
drop policy if exists "admins read admins" on public.raffle_admins;
create policy "admins read admins" on public.raffle_admins for select to authenticated using (user_id=auth.uid());

revoke all on public.raffle_requests from anon, authenticated;
revoke all on public.raffle_request_numbers from anon, authenticated;
revoke all on public.raffle_admins from anon, authenticated;
revoke insert,update,delete on public.raffle_numbers from anon, authenticated;
grant select on public.raffle_settings,public.raffle_numbers to anon,authenticated;
grant select on public.raffle_requests,public.raffle_request_numbers,public.raffle_admins to authenticated;

revoke all on function public.create_raffle_request(text,text,text,integer[]) from public;
grant execute on function public.create_raffle_request(text,text,text,integer[]) to anon,authenticated;
revoke all on function public.public_participant_summary() from public;
grant execute on function public.public_participant_summary() to anon,authenticated;
revoke all on function public.is_raffle_admin() from public;
grant execute on function public.is_raffle_admin() to authenticated;
revoke all on function public.approve_raffle_request(uuid) from public;
grant execute on function public.approve_raffle_request(uuid) to authenticated;
revoke all on function public.reject_raffle_request(uuid) from public;
grant execute on function public.reject_raffle_request(uuid) to authenticated;
revoke all on function public.update_raffle_settings(text,text,date,integer) from public;
grant execute on function public.update_raffle_settings(text,text,date,integer) to authenticated;

-- Después de crear tu usuario en Supabase Authentication, ejecuta:
-- insert into public.raffle_admins(user_id)
-- select id from auth.users where email = 'TU_CORREO_ADMIN';
