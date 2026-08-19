// Umbral por producto: la cifra que convierte «4 unidades» en «queda poco».
//
// Vive en la columna productos.minimo para que un punto pueda ajustarla cuando
// haga falta. Estos son los valores de arranque por categoría, calibrados con
// lo que se mueve en un acopio: agua y comida rotan rápido y se cuentan por
// decenas; los medicamentos se cuentan por unidades.
export const MINIMO_POR_CATEGORIA = {
  agua: 50,
  comida: 30,
  cobijas: 20,
  ropa: 20,
  higiene: 20,
  ninos: 15,
  medicinas: 10,
  mascotas: 10,
  otro: 10,
};

export const MINIMO_POR_DEFECTO = 10;

export function minimoDe(categoria) {
  return MINIMO_POR_CATEGORIA[categoria] ?? MINIMO_POR_DEFECTO;
}

/**
 * Estado de existencias de una línea de inventario.
 * `agotado` pesa más que `bajo`: es lo que decide si alguien viaja o no.
 */
export function estadoStock(stock, minimo) {
  const hay = Number(stock) || 0;
  const piso = Number(minimo) > 0 ? Number(minimo) : MINIMO_POR_DEFECTO;
  if (hay <= 0) return "agotado";
  if (hay <= piso) return "bajo";
  return "ok";
}
