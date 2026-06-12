import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function splitList(v) {
  if (!v) return [];
  return String(v)
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x !== "");
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
      offset = "0",
      limit = "100",
    } = req.query;

    const off = Math.max(0, parseInt(offset, 10) || 0);
    const lim = Math.min(500, Math.max(1, parseInt(limit, 10) || 100)); // protección

    let query = supabase
      .from("creditos_radicados")
      .select("*", { count: "exact" })
      .order("fecha", { ascending: false });

    // Búsquedas
    const ors = [];
    if (q) ors.push(`numero_credito.ilike.%${q}%,cedula.ilike.%${q}%`);
    if (q2) ors.push(`numero_credito.ilike.%${q2}%,cedula.ilike.%${q2}%`);
    if (ors.length) query = query.or(ors.join(","));

    // Multi-filtros (IN)
    const ent = splitList(entidad);
    const an = splitList(anio);
    const me = splitList(mes);
    const li = splitList(linea);
    const et = splitList(etapa);
    const op = splitList(operativo);
    const of = splitList(oficina);

    if (ent.length) query = query.in("entidad", ent);
    if (an.length) query = query.in("anio", an);
    if (me.length) query = query.in("mes", me);
    if (li.length) query = query.in("linea", li);
    if (et.length) {
  const etapasNormales = et.filter((e) => e !== "__VACIO__");
  const incluirVacio = et.includes("__VACIO__");

  if (etapasNormales.length && incluirVacio) {
    const lista = etapasNormales.map((e) => `"${e}"`).join(",");
    query = query.or(`etapa.in.(${lista}),etapa.is.null,etapa.eq.""`);
  } else if (etapasNormales.length) {
    query = query.in("etapa", etapasNormales);
  } else if (incluirVacio) {
    query = query.or('etapa.is.null,etapa.eq.""');
  }
}
    if (op.length) query = query.in("operativo", op);
    if (of.length) query = query.in("oficina", of);

    // Simples
    if (resultado) query = query.eq("resultado_consulta", resultado);
    if (coordinador) query = query.eq("coordinador", coordinador);
    if (ejecutivo) query = query.eq("ejecutivo_comercial", ejecutivo);

    query = query.range(off, off + lim - 1);

    const { data, error, count } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const total = Number(count || 0);
    const rows = data || [];
    const hasMore = off + rows.length < total;

    return res.status(200).json({ rows, total, hasMore, offset: off, limit: lim });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}
