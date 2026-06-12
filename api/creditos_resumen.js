import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function splitList(v) {
  if (!v) return null;
  const arr = String(v)
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x !== "");
  return arr.length ? arr : null;
}

export default async function handler(req, res) {
  try {
    const {
      q,
      q2,
      entidad,
      anio,
      mes,
      linea,
      etapa,
      operativo,
      oficina,
      resultado,
      coordinador,
      ejecutivo,
    } = req.query;

    const { data, error } = await supabase.rpc("creditos_dashboard_resumen", {
      p_q: q || null,
      p_q2: q2 || null,
      p_entidad: splitList(entidad),
      p_anio: splitList(anio),
      p_mes: splitList(mes),
      p_linea: splitList(linea),
      p_etapa: splitList(etapa),
      p_operativo: splitList(operativo),
      p_oficina: splitList(oficina),
      p_resultado: resultado || null,
      p_coordinador: coordinador || null,
      p_ejecutivo: ejecutivo || null,
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}
