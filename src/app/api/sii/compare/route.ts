import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSiiRegistryFile } from "@/lib/sii/registry-parser";

export async function POST(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const form = await request.formData();
  const upload = form.get("file");
  if (!(upload instanceof File)) return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });

  const buffer = Buffer.from(await upload.arrayBuffer());
  const rows = parseSiiRegistryFile({ buffer, name: upload.name, type: upload.type });
  const supabase = createAdminClient();
  const rutList = [...new Set(rows.map((row) => row.rutProveedor).filter(Boolean))];
  const folios = [...new Set(rows.map((row) => row.folio).filter(Boolean))];
  const { data: docs } = rutList.length && folios.length
    ? await supabase
      .from("dte_documents")
      .select("id,tipo_dte,folio,rut_emisor,razon_social_emisor,fecha_emision,monto_total")
      .in("rut_emisor", rutList)
      .in("folio", folios)
      .limit(5000)
    : { data: [] };
  const docMap = new Map((docs ?? []).map((doc) => [`${doc.rut_emisor}:${doc.tipo_dte}:${doc.folio}`, doc]));
  const results = rows.map((row) => {
    const doc = docMap.get(`${row.rutProveedor}:${row.tipoDte}:${row.folio}`) ?? docMap.get(`${row.rutProveedor}:33:${row.folio}`) ?? null;
    const montoXml = Number(doc?.monto_total ?? 0);
    const diff = Math.abs(montoXml - row.montoTotal);
    const state = !doc ? "falta_xml" : diff > 10 ? "diferencia_monto" : "xml_recibido";
    return {
      ...row,
      dteDocumentId: doc?.id ?? null,
      montoXml,
      estado: state,
      accion: state === "falta_xml"
        ? `Solicitar XML a proveedor para folio ${row.folio}.`
        : state === "diferencia_monto"
          ? "Revisar diferencia entre Registro SII y XML recibido."
          : "Documento conciliado con XML recibido."
    };
  });
  const summary = {
    diferenciaMonto: results.filter((row) => row.estado === "diferencia_monto").length,
    faltanXml: results.filter((row) => row.estado === "falta_xml").length,
    total: results.length,
    xmlRecibido: results.filter((row) => row.estado === "xml_recibido").length
  };
  await supabase.from("audit_events").insert({
    actor_user_id: user.id,
    after_data: { filename: upload.name, ...summary },
    entity_type: "sii_registry_import",
    event_type: "sii.registry_compared"
  });
  return NextResponse.json({ ok: true, results, summary });
}
