import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseDteXml } from "../src/lib/dte/parser.ts";

function parse(xml: string) {
  return parseDteXml({
    sourceAttachmentId: "fixture-attachment",
    sourceFilename: "fixture.xml",
    sourceMessageId: "fixture-message",
    xml
  });
}

function xml(details: string, extras = "") {
  return `<?xml version="1.0" encoding="ISO-8859-1"?>
  <DTE xmlns="http://www.sii.cl/SiiDte">
    <Documento>
      <Encabezado>
        <IdDoc><TipoDTE>33</TipoDTE><Folio>4972</Folio><FchEmis>2026-05-18</FchEmis></IdDoc>
        <Emisor><RUTEmisor>77192155-8</RUTEmisor><RznSoc>ONDA DEL MARE SPA</RznSoc></Emisor>
        <Receptor><RUTRecep>76123456-7</RUTRecep><RznSocRecep>LA COCINA DE JAVIER</RznSocRecep></Receptor>
        <Totales><MntNeto>323400</MntNeto><TasaIVA>19</TasaIVA><IVA>61446</IVA><MntTotal>384846</MntTotal>${extras}</Totales>
      </Encabezado>
      ${details}
      <Referencia><NroLinRef>1</NroLinRef><TpoDocRef>801</TpoDocRef><FolioRef>OC-77</FolioRef><FchRef>2026-05-18</FchRef></Referencia>
    </Documento>
  </DTE>`;
}

test("ONDA folio 4972 keeps NmbItem LOCOS CONSERVA instead of DscItem packaging", () => {
  const parsed = parse(xml(`<Detalle>
    <NroLinDet>1</NroLinDet><NmbItem>LOCOS CONSERVA</NmbItem><DscItem>1 caja</DscItem>
    <QtyItem>12.00</QtyItem><UnmdItem>KG</UnmdItem><PrcItem>26950.00</PrcItem><MontoItem>323400</MontoItem>
  </Detalle>`));
  assert.equal(parsed.folio, "4972");
  assert.equal(parsed.items[0]?.name, "LOCOS CONSERVA");
  assert.equal(parsed.items[0]?.rawDescription, "1 caja");
  assert.equal(parsed.items[0]?.productEligible, true);
});

test("numeric NmbItem uses descriptive DscItem but preserves raw fields", () => {
  const parsed = parse(xml(`<Detalle>
    <NroLinDet>1</NroLinDet><NmbItem>20.00</NmbItem><DscItem>LICOR DE CACAO</DscItem>
    <QtyItem>1</QtyItem><UnmdItem>UN</UnmdItem><PrcItem>323400</PrcItem><MontoItem>323400</MontoItem><CodImpAdic>24</CodImpAdic>
  </Detalle>`, `<ImptoReten><TipoImp>24</TipoImp><TasaImp>31.5</TasaImp><MontoImp>100</MontoImp></ImptoReten>`));
  assert.equal(parsed.items[0]?.name, "LICOR DE CACAO");
  assert.equal(parsed.items[0]?.rawName, "20");
  assert.equal(parsed.items[0]?.additionalTaxCode, "24");
  assert.deepEqual(parsed.raw.taxes.map((tax) => tax.tipoImp), ["24", "24"]);
});

test("single and multiple Detalle nodes parse with references", () => {
  const single = parse(xml(`<Detalle>
    <NroLinDet>1</NroLinDet><NmbItem>MANZANA HILO</NmbItem><QtyItem>2</QtyItem><PrcItem>1000</PrcItem><MontoItem>2000</MontoItem>
  </Detalle>`));
  const multiple = parse(xml(`<Detalle>
    <NroLinDet>1</NroLinDet><NmbItem>VINO TINTO LOMA LARGA PINOT NOIR</NmbItem><QtyItem>3</QtyItem><PrcItem>8488</PrcItem><MontoItem>25464</MontoItem>
  </Detalle><Detalle>
    <NroLinDet>2</NroLinDet><NmbItem>LOCOS CONSERVA</NmbItem><QtyItem>1</QtyItem><PrcItem>1000</PrcItem><MontoItem>1000</MontoItem>
  </Detalle>`));
  assert.equal(single.items.length, 1);
  assert.equal(multiple.items.length, 2);
  assert.equal(multiple.raw.references[0]?.referencedFolio, "OC-77");
});

test("invalid line price lowers price confidence for price history gates", () => {
  const parsed = parse(xml(`<Detalle>
    <NroLinDet>1</NroLinDet><NmbItem>VINO TINTO LOMA LARGA PINOT NOIR</NmbItem>
    <QtyItem>3</QtyItem><PrcItem>8488</PrcItem><MontoItem>22918</MontoItem>
  </Detalle>`));
  assert.equal(parsed.items[0]?.validationStatus, "warning");
  assert.ok((parsed.items[0]?.priceConfidenceScore ?? 100) < 90);
});

test("PDF route paginates item detail before totals and traceability blocks", async () => {
  const source = await readFile("src/app/api/invoices/[folio]/pdf/route.ts", "utf8");
  assert.match(source, /index \+= 12/);
  assert.match(source, /const finalPage = index === chunks\.length - 1/);
  assert.match(source, /Trazabilidad XML/);
});
