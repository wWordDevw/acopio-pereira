export function distanciaKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function filtrarPuntos(puntos, query) {
  let rows = puntos;
  if (query.q) {
    const needle = query.q.toLowerCase();
    rows = rows.filter((p) => {
      const hay = `${p.nombre} ${p.nota || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }
  if (query.categoria) {
    rows = rows.filter((p) =>
      (p.inventario || []).some(
        (i) =>
          i.categoria === query.categoria && i.stock > 0 && i.producto_id,
      ),
    );
  }
  if (query.con_stock) {
    rows = rows.filter((p) => (p.inventario || []).some((i) => i.stock > 0));
  }
  if (query.lat != null && query.lng != null) {
    rows = rows
      .map((p) => ({
        ...p,
        distancia_km: Math.round(distanciaKm(query.lat, query.lng, p.lat, p.lng) * 10) / 10,
      }))
      .filter((p) => p.distancia_km <= query.radio)
      .sort((a, b) => a.distancia_km - b.distancia_km);
  }
  return rows.slice(0, query.limit);
}
