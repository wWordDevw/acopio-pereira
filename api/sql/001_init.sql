create table if not exists puntos (
  id text primary key,
  nombre text not null
    check (length(nombre) between 2 and 80),
  nota text
    check (nota is null or length(nota) <= 200),
  lat real not null,
  lng real not null,
  idempotency_key text not null unique,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create index if not exists puntos_updated
  on puntos (updated_at desc);

create table if not exists movimientos (
  id text primary key,
  punto_id text not null references puntos(id),
  tipo text not null check (tipo in ('entra', 'sale')),
  categoria text not null check (categoria in (
    'agua', 'comida', 'medicinas', 'cobijas', 'ropa',
    'higiene', 'ninos', 'mascotas', 'otro'
  )),
  cantidad integer not null check (cantidad >= 1 and cantidad <= 999),
  texto_original text,
  idempotency_key text not null unique,
  created_at text not null default (datetime('now'))
);

create index if not exists movimientos_punto
  on movimientos (punto_id, created_at desc);

create table if not exists rate_limits (
  clave text primary key,
  ventana text not null,
  conteo integer not null default 0
);
