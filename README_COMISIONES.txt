Módulo de Comisiones actualizado

Archivos incluidos:
- index.html
- script.js
- sql_comisiones_calculadas.sql
- sql_comisiones_detalle.sql

Cambios principales:
- Vista de comprobante imprimible por cliente.
- Tabla guardada con botón "Comprobante".
- Soporte para guardar detalle en comisiones_detalle.
- La tabla comisiones_calculadas conserva el resumen por asesor y período.
- El comprobante usa:
  * cédula del cliente
  * nombre del cliente
  * línea
  * seguro
  * valor pagado y comisión por libranza, consumo, hipotecario y TC

Notas:
- El script actualizado guarda detalle al momento de guardar comisiones.
- La columna pagada se usa en comisiones_calculadas.
- Si una comisión antigua no tiene detalle guardado, el comprobante muestra un fallback resumen.
