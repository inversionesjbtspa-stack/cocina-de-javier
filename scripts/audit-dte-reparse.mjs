import pg from "pg";

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

await client.connect();

try {
  const cases = await client.query(`
    select d.razon_social_emisor, d.rut_emisor, d.folio, i.line_number, i.name,
           i.item_name_raw, i.item_description_raw, i.product_id is not null as has_product,
           i.quantity, i.unit, i.unit_price, i.line_total, i.additional_tax_code
      from public.dte_documents d
      join public.dte_items i on i.dte_document_id = d.id
     where (d.folio = '4972' and d.rut_emisor = '77192155-8')
        or (d.folio = '503938' and i.name ilike '%LOMA LARGA%')
        or (d.folio = '222466' and i.additional_tax_code is not null)
     order by d.folio, i.line_number
  `);
  const counts = await client.query(`
    select
      (select count(*) from public.dte_documents) as documents,
      (select count(*) from public.dte_items) as items,
      (select count(*) from public.dte_items where product_id is null) as items_without_products,
      (select count(*) from public.dte_items where lower(name) in ('1 caja', '1 unidad')) as suspicious_names,
      (select count(*) from public.dte_taxes where dte_item_id is not null) as item_tax_rows,
      (select count(*) from public.dte_taxes where dte_item_id is null) as document_tax_rows,
      (select count(*) from public.product_price_history where source_entity_type = 'dte_document') as price_history_rows
  `);
  const missingProducts = await client.query(`
    select d.folio, d.rut_emisor, d.razon_social_emisor,
           d.xml_original is not null as has_xml_original,
           count(*) as missing_product_items
      from public.dte_documents d
      join public.dte_items i on i.dte_document_id = d.id
     where i.product_id is null
     group by d.id
     order by missing_product_items desc, d.fecha_emision desc
     limit 20
  `);
  console.log(JSON.stringify({ cases: cases.rows, counts: counts.rows[0], missingProducts: missingProducts.rows }, null, 2));
} finally {
  await client.end();
}
