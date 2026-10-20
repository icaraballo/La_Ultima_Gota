/** Escapa un texto para meterlo en HTML (contenido o atributo entre comillas). Todo lo que escribe
 * el jugador pasa por aquí antes de llegar a un innerHTML. */
export const esc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
