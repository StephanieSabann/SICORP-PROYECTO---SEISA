/* ============================================================
   Programador de reportes por correo
   ------------------------------------------------------------
   Cada minuto revisa los envíos programados (Soporte y
   Mantenimiento → Reportes) y manda los que ya "tocaban". Corre
   dentro del mismo proceso del servidor; si el servidor está
   apagado a la hora del envío, sale en cuanto se vuelva a
   encender (se compara contra la última ejecución).
   ============================================================ */

function iniciarProgramadorReportes(servicio, { intervaloMs = 60000, registro = console } = {}) {
    let ocupado = false;
    const tick = async () => {
        if (ocupado) return;
        ocupado = true;
        try {
            const hechos = await servicio.ejecutarPendientes();
            if (hechos.length) registro.log(`[Reportes] Envíos programados ejecutados: ${hechos.join(", ")}`);
        } catch (error) {
            registro.error("[Reportes] Error en el programador:", error.message);
        } finally {
            ocupado = false;
        }
    };
    const timer = setInterval(tick, intervaloMs);
    if (timer.unref) timer.unref(); // no impide que el proceso termine
    return { detener: () => clearInterval(timer), tick };
}

module.exports = { iniciarProgramadorReportes };
