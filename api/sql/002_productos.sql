create table if not exists productos (
  id text primary key,
  slug text not null unique,
  nombre text not null,
  categoria text not null check (categoria in (
    'agua', 'comida', 'medicinas', 'cobijas', 'ropa',
    'higiene', 'ninos', 'mascotas', 'otro'
  )),
  aliases text not null default '[]',
  foto_path text,
  created_at text not null default (datetime('now'))
);

create index if not exists productos_categoria
  on productos (categoria, nombre);
