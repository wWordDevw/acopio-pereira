create table if not exists ordenes (
  id text primary key,
  punto_id text not null references puntos(id),
  tipo text not null check (tipo in ('entra', 'sale')),
  abierta_at text not null,
  dia text not null check (length(dia) = 10),
  cerrada_at text not null default (datetime('now')),
  nota text check (nota is null or length(nota) <= 200),
  foto_path text,
  idempotency_key text not null unique
);

create index if not exists ordenes_punto_dia
  on ordenes (punto_id, dia, abierta_at desc);
