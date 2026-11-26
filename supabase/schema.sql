-- Meu Treino — schema Supabase
-- Rode este arquivo inteiro no Supabase: Dashboard → SQL Editor → New query → colar → Run.
-- É idempotente (pode rodar mais de uma vez).

-- Sessões de treino (Iniciar/Finalizar treino + tempo total)
create table if not exists public.workout_sessions (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day_index     int  not null,
  day_name      text,
  started_at    timestamptz not null,
  ended_at      timestamptz,
  duration_sec  int,
  source        text not null default 'app', -- app | import | baseline (ponto de partida) | manual (ajuste de pesos)
  notes         text,
  created_at    timestamptz not null default now()
);

-- Cada série concluída (peso, reps e descanso após a série)
create table if not exists public.set_logs (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id    uuid not null references public.workout_sessions(id) on delete cascade,
  day_index     int  not null,
  exercise_id   text not null,
  set_number    int  not null,
  weight        numeric(7,2),
  reps          int,
  rest_sec      int,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- tipos de sessão aceitos (idempotente: funciona também se a tabela já existia)
alter table public.workout_sessions drop constraint if exists workout_sessions_source_check;
alter table public.workout_sessions add constraint workout_sessions_source_check
  check (source in ('app','import','baseline','manual'));

-- Preferências (faixa de reps, incremento de carga, etc.)
create table if not exists public.user_settings (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  settings    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create index if not exists workout_sessions_user_started_idx on public.workout_sessions (user_id, started_at);
create index if not exists set_logs_user_ex_idx on public.set_logs (user_id, day_index, exercise_id);
create index if not exists set_logs_session_idx on public.set_logs (session_id);

-- Row Level Security: cada usuário só enxerga e altera os próprios dados
alter table public.workout_sessions enable row level security;
alter table public.set_logs         enable row level security;
alter table public.user_settings    enable row level security;

drop policy if exists "own sessions" on public.workout_sessions;
create policy "own sessions" on public.workout_sessions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own sets" on public.set_logs;
create policy "own sets" on public.set_logs
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- recarrega o cache da API para as tabelas aparecerem na hora
notify pgrst, 'reload schema';
