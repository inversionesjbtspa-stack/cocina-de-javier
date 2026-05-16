param(
  [string]$OutputPath = "preview\dte-purchases-2026.json",
  [string]$Since = "1-Jan-2026",
  [string]$Subject = "",
  [int]$MaxMessages = 0
)

$ErrorActionPreference = "Stop"

if (-not $env:DTE_IMAP_USER -or -not $env:DTE_IMAP_APP_PASSWORD) {
  throw "Set DTE_IMAP_USER and DTE_IMAP_APP_PASSWORD before running this script."
}

function ConvertTo-Clp([double]$Value) {
  return ([System.Globalization.CultureInfo]::GetCultureInfo("es-CL")).NumberFormat.CurrencySymbol + ([int64]$Value).ToString("N0", [System.Globalization.CultureInfo]::GetCultureInfo("es-CL"))
}

function Decode-Entities([string]$Value) {
  if ($null -eq $Value) { return "" }
  return ([System.Net.WebUtility]::HtmlDecode($Value)).Trim()
}

function Get-Tag([string]$Xml, [string]$Name) {
  $match = [regex]::Match($Xml, "<$Name(?:\s[^>]*)?>([\s\S]*?)</$Name>", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($match.Success) { return Decode-Entities $match.Groups[1].Value }
  return ""
}

function Get-Blocks([string]$Xml, [string]$Name) {
  return [regex]::Matches($Xml, "<$Name(?:\s[^>]*)?>([\s\S]*?)</$Name>", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase) | ForEach-Object { $_.Groups[1].Value }
}

function To-Number([string]$Value) {
  $normalized = ($Value -replace ",", ".")
  $parsed = 0.0
  if ([double]::TryParse($normalized, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
    return $parsed
  }
  return 0
}

function Get-Sha256([string]$Value) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
  $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
  return ([System.BitConverter]::ToString($hash)).Replace("-", "").ToLowerInvariant()
}

function Add-DaysText([string]$DateText, [int]$Days) {
  $date = [datetime]::MinValue
  if ([datetime]::TryParseExact($DateText, "yyyy-MM-dd", [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref]$date)) {
    return $date.AddDays($Days).ToString("yyyy-MM-dd")
  }
  return ""
}

function Decode-MimeWord([string]$Value) {
  if (-not $Value) { return "" }
  return [regex]::Replace($Value, "=\?([^?]+)\?([BQbq])\?([^?]+)\?=", {
    param($m)
    $charset = $m.Groups[1].Value
    $encoding = $m.Groups[2].Value.ToUpperInvariant()
    $encoded = $m.Groups[3].Value
    if ($encoding -eq "B") {
      $bytes = [Convert]::FromBase64String($encoded)
    } else {
      $qp = $encoded.Replace("_", " ")
      $decoded = [regex]::Replace($qp, "=([0-9A-Fa-f]{2})", { param($hm) [char][Convert]::ToInt32($hm.Groups[1].Value, 16) })
      $bytes = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetBytes($decoded)
    }
    if ($charset -match "iso-8859-1|latin1") {
      return [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($bytes)
    }
    return [System.Text.Encoding]::UTF8.GetString($bytes)
  })
}

function Get-HeaderMap([string]$HeaderText) {
  $map = @{}
  $unfolded = $HeaderText -replace "`r?`n[ `t]+", " "
  foreach ($line in ($unfolded -split "`r?`n")) {
    $idx = $line.IndexOf(":")
    if ($idx -gt -1) {
      $map[$line.Substring(0, $idx).ToLowerInvariant()] = $line.Substring($idx + 1).Trim()
    }
  }
  return $map
}

function Get-HeaderParam([string]$Value, [string]$Name) {
  if (-not $Value) { return "" }
  $match = [regex]::Match($Value, "$Name\*?=(?:""([^""]+)""|([^;]+))", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($match.Success) {
    return (Decode-MimeWord (($match.Groups[1].Value + $match.Groups[2].Value) -replace "^utf-8''", ""))
  }
  return ""
}

function Decode-PartBody([string]$Body, [string]$Encoding, [string]$Charset) {
  $enc = ""
  if ($null -ne $Encoding) { $enc = $Encoding.ToLowerInvariant() }
  if ($enc -eq "base64") {
    $bytes = [Convert]::FromBase64String(($Body -replace "\s", ""))
  } elseif ($enc -eq "quoted-printable") {
    $compact = $Body -replace "=`r?`n", ""
    $decoded = [regex]::Replace($compact, "=([0-9A-Fa-f]{2})", { param($m) [char][Convert]::ToInt32($m.Groups[1].Value, 16) })
    $bytes = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetBytes($decoded)
  } else {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
  }

  $charsetValue = ""
  if ($null -ne $Charset) { $charsetValue = $Charset }
  if ($charsetValue -match "iso-8859-1|latin1") {
    return [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($bytes)
  }
  return [System.Text.Encoding]::UTF8.GetString($bytes)
}

function Split-Mime([string]$Body, [string]$Boundary) {
  if (-not $Boundary) { return @($Body) }
  $escaped = [regex]::Escape("--$Boundary")
  return ([regex]::Split($Body, $escaped) | Select-Object -Skip 1 | Where-Object { $_ -notmatch "^\s*--" } | ForEach-Object { ($_ -replace "^\r?\n", "") -replace "\r?\n$", "" })
}

function Get-XmlAttachments([string]$RawMessage) {
  $fallbackAttachments = @()
  foreach ($match in [regex]::Matches($RawMessage, "name=""([^""]+\.xml)""[\s\S]*?Content-Transfer-Encoding:\s*base64[\s\S]*?\r?\n\r?\n([A-Za-z0-9+/=\r\n]+)", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
    try {
      $filename = Decode-MimeWord $match.Groups[1].Value
      $bytes = [Convert]::FromBase64String(($match.Groups[2].Value -replace "\s", ""))
      $xml = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($bytes)
      if ($xml -match "<DTE|<EnvioDTE") {
        $fallbackAttachments += [pscustomobject]@{ Filename = $filename; Xml = $xml }
      }
    } catch {
    }
  }

  $pieces = [regex]::Split($RawMessage, "\r?\n\r?\n", 2)
  if ($pieces.Count -lt 2) { return $fallbackAttachments }

  $headers = Get-HeaderMap $pieces[0]
  $body = $pieces[1]
  $boundary = Get-HeaderParam $headers["content-type"] "boundary"
  $queue = New-Object System.Collections.Generic.Queue[string]
  foreach ($part in (Split-Mime $body $boundary)) { $queue.Enqueue($part) }
  if ($queue.Count -eq 0) { $queue.Enqueue($body) }

  $attachments = @()
  while ($queue.Count -gt 0) {
    $part = $queue.Dequeue()
    $partPieces = [regex]::Split($part, "\r?\n\r?\n", 2)
    if ($partPieces.Count -lt 2) { continue }
    $partHeaders = Get-HeaderMap $partPieces[0]
    $partBody = $partPieces[1]
    $contentType = $partHeaders["content-type"]
    $nestedBoundary = Get-HeaderParam $contentType "boundary"

    if ($nestedBoundary) {
      foreach ($nested in (Split-Mime $partBody $nestedBoundary)) { $queue.Enqueue($nested) }
      continue
    }

    $filename = Get-HeaderParam $partHeaders["content-disposition"] "filename"
    if (-not $filename) { $filename = Get-HeaderParam $contentType "name" }
    if (-not $filename) { $filename = "documento.xml" }

    $isXml = $filename -match "\.xml$" -or $contentType -match "xml"
    if (-not $isXml) { continue }

    $charset = Get-HeaderParam $contentType "charset"
    if (-not $charset) { $charset = "utf-8" }
    $xml = Decode-PartBody $partBody $partHeaders["content-transfer-encoding"] $charset
    if ($xml -match "<DTE|<EnvioDTE") {
      $attachments += [pscustomobject]@{ Filename = $filename; Xml = $xml }
    }
  }
  if ($attachments.Count -gt 0) { return $attachments }
  return $fallbackAttachments
}

function Parse-DteXml([string]$Xml, [object]$Source) {
  $tipoDte = Get-Tag $Xml "TipoDTE"
  $folio = Get-Tag $Xml "Folio"
  $rutEmisor = Get-Tag $Xml "RUTEmisor"
  $fechaEmision = Get-Tag $Xml "FchEmis"
  $montoTotal = To-Number (Get-Tag $Xml "MntTotal")

  if (-not $tipoDte -or -not $folio -or -not $rutEmisor -or -not $fechaEmision -or $montoTotal -le 0) {
    return $null
  }

  $items = @()
  $line = 0
  foreach ($detail in (Get-Blocks $Xml "Detalle")) {
    $line += 1
    $lineNumber = To-Number (Get-Tag $detail "NroLinDet")
    if ($lineNumber -le 0) { $lineNumber = $line }
    $items += [pscustomobject]@{
      lineNumber = [int]$lineNumber
      description = (Get-Tag $detail "NmbItem")
      quantity = To-Number (Get-Tag $detail "QtyItem")
      unit = (Get-Tag $detail "UnmdItem")
      unitPrice = To-Number (Get-Tag $detail "PrcItem")
      lineTotal = To-Number (Get-Tag $detail "MontoItem")
    }
  }

  $normalizedKey = "$rutEmisor|$tipoDte|$folio"
  $xmlSha256 = Get-Sha256 $Xml
  $fechaVencimiento = Get-Tag $Xml "FchVenc"
  if (-not $fechaVencimiento) { $fechaVencimiento = Add-DaysText $fechaEmision 30 }

  return [pscustomobject]@{
    idempotencyKey = "$normalizedKey|$xmlSha256"
    normalizedKey = $normalizedKey
    tipoDte = $tipoDte
    documentType = $(if ($tipoDte -eq "61") { "Nota credito" } else { "Factura" })
    folio = $folio
    rutEmisor = $rutEmisor
    razonSocialEmisor = Get-Tag $Xml "RznSoc"
    rutReceptor = Get-Tag $Xml "RUTRecep"
    razonSocialReceptor = Get-Tag $Xml "RznSocRecep"
    fechaEmision = $fechaEmision
    fechaVencimiento = $fechaVencimiento
    formaPago = Get-Tag $Xml "FmaPago"
    montoNeto = To-Number (Get-Tag $Xml "MntNeto")
    montoExento = To-Number (Get-Tag $Xml "MntExe")
    iva = To-Number (Get-Tag $Xml "IVA")
    montoTotal = $montoTotal
    montoTotalClp = ConvertTo-Clp $montoTotal
    xmlSha256 = $xmlSha256
    paymentStatus = "Pendiente"
    source = $Source
    items = $items
  }
}

function Read-Until([System.Net.Security.SslStream]$Stream, [string]$Pattern, [int]$TimeoutSeconds = 120) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $builder = [System.Text.StringBuilder]::new()
  $buffer = New-Object byte[] 16384
  $Stream.ReadTimeout = 1000
  while ((Get-Date) -lt $deadline) {
    try {
      $read = $Stream.Read($buffer, 0, $buffer.Length)
      if ($read -gt 0) {
        [void]$builder.Append([System.Text.Encoding]::UTF8.GetString($buffer, 0, $read))
      }
      if ($builder.ToString() -match $Pattern) { return $builder.ToString() }
    } catch [System.IO.IOException] {
      Start-Sleep -Milliseconds 25
    }
  }
  throw "Timed out waiting for $Pattern"
}

function Send-Command([System.IO.StreamWriter]$Writer, [System.Net.Security.SslStream]$Stream, [string]$Tag, [string]$CommandText) {
  $Writer.WriteLine("$Tag $CommandText")
  $Writer.Flush()
  return Read-Until $Stream "$Tag (OK|NO|BAD)"
}

function Summarize-Invoices([array]$Invoices) {
  $byDay = @{}
  $byMonth = @{}
  $byYear = @{}
  $suppliers = @{}
  $products = @{}

  foreach ($invoice in $Invoices) {
    $date = $invoice.fechaEmision
    $month = $date.Substring(0, 7)
    $year = $date.Substring(0, 4)
    $multiplier = $(if ($invoice.tipoDte -eq "61") { -1 } else { 1 })

    foreach ($entry in @(@($byDay, $date), @($byMonth, $month), @($byYear, $year))) {
      $target = $entry[0]
      $key = $entry[1]
      if (-not $target.ContainsKey($key)) {
        $target[$key] = [pscustomobject]@{ key = $key; documents = 0; invoices = 0; creditNotes = 0; total = 0.0; iva = 0.0 }
      }
      $target[$key].documents += 1
      if ($invoice.tipoDte -eq "61") { $target[$key].creditNotes += 1 } else { $target[$key].invoices += 1 }
      $target[$key].total += $multiplier * $invoice.montoTotal
      $target[$key].iva += $multiplier * $invoice.iva
    }

    if (-not $suppliers.ContainsKey($invoice.rutEmisor)) {
      $suppliers[$invoice.rutEmisor] = [pscustomobject]@{ rut = $invoice.rutEmisor; razonSocial = $invoice.razonSocialEmisor; documents = 0; total = 0.0 }
    }
    $suppliers[$invoice.rutEmisor].documents += 1
    $suppliers[$invoice.rutEmisor].total += $multiplier * $invoice.montoTotal

    foreach ($item in $invoice.items) {
      $key = $item.description.ToLowerInvariant()
      if (-not $products.ContainsKey($key)) {
        $products[$key] = [pscustomobject]@{ description = $item.description; quantity = 0.0; documents = 0; total = 0.0; lastPrices = @() }
      }
      $products[$key].quantity += $item.quantity
      $products[$key].documents += 1
      $products[$key].total += $item.lineTotal
      $products[$key].lastPrices += [pscustomobject]@{ date = $invoice.fechaEmision; folio = $invoice.folio; supplier = $invoice.razonSocialEmisor; unitPrice = $item.unitPrice }
      $products[$key].lastPrices = @($products[$key].lastPrices | Sort-Object date -Descending | Select-Object -First 3)
    }
  }

  $decorate = {
    param($rows)
    return @($rows.Values | Sort-Object key -Descending | ForEach-Object {
      $_ | Add-Member -NotePropertyName totalClp -NotePropertyValue (ConvertTo-Clp $_.total) -Force
      $_ | Add-Member -NotePropertyName ivaClp -NotePropertyValue (ConvertTo-Clp $_.iva) -Force
      $_
    })
  }

  return [pscustomobject]@{
    byDay = & $decorate $byDay
    byMonth = & $decorate $byMonth
    byYear = & $decorate $byYear
    suppliers = @($suppliers.Values | Sort-Object total -Descending | ForEach-Object { $_ | Add-Member -NotePropertyName totalClp -NotePropertyValue (ConvertTo-Clp $_.total) -Force; $_ })
    products = @($products.Values | Sort-Object total -Descending | ForEach-Object { $_ | Add-Member -NotePropertyName totalClp -NotePropertyValue (ConvertTo-Clp $_.total) -Force; $_ })
  }
}

$client = [System.Net.Sockets.TcpClient]::new("imap.gmail.com", 993)
$ssl = [System.Net.Security.SslStream]::new($client.GetStream(), $false)
$ssl.AuthenticateAsClient("imap.gmail.com")
$writer = [System.IO.StreamWriter]::new($ssl, [System.Text.Encoding]::ASCII)
$writer.NewLine = "`r`n"

try {
  [void](Read-Until $ssl "^\* OK")
  [void](Send-Command $writer $ssl "A0001" "LOGIN `"$($env:DTE_IMAP_USER)`" `"$($env:DTE_IMAP_APP_PASSWORD)`"")
  [void](Send-Command $writer $ssl "A0002" "SELECT INBOX")
  $searchCommand = "UID SEARCH SINCE $Since"
  if ($Subject) {
    $searchCommand = "$searchCommand SUBJECT `"$Subject`""
  }
  $searchResult = Send-Command $writer $ssl "A0003" $searchCommand
  $searchLine = (($searchResult -split "`r?`n") | Where-Object { $_ -like "* SEARCH*" } | Select-Object -First 1)
  $ids = @($searchLine -replace "^\* SEARCH\s*", "" -split "\s+" | Where-Object { $_ })
  if ($MaxMessages -gt 0 -and $ids.Count -gt $MaxMessages) {
    $ids = @($ids | Select-Object -Last $MaxMessages)
  }
  Write-Host "Messages found since ${Since}: $($ids.Count)"

  $invoicesByKey = @{}
  $errors = @()
  $processed = 0

  foreach ($uid in $ids) {
    $processed += 1
    try {
      $tag = "F" + $processed.ToString("000000")
      $writer.WriteLine("$tag UID FETCH $uid (BODY.PEEK[])")
      $writer.Flush()
      $rawResponse = Read-Until $ssl "$tag (OK|NO|BAD)" 180
      $literalMatch = [regex]::Match($rawResponse, "\{(\d+)\}\r?\n([\s\S]*)\r?\n\)\r?\n$tag OK", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
      $rawMessage = $(if ($literalMatch.Success) { $literalMatch.Groups[2].Value } else { $rawResponse })
      if ($env:DTE_DEBUG_RAW -eq "1" -and $processed -eq 1) {
        $debugPath = Join-Path (Get-Location) "preview\debug-imap-sample.txt"
        $rawMessage | Set-Content -LiteralPath $debugPath -Encoding UTF8
        Write-Host "Debug sample wrote $debugPath"
      }

      foreach ($attachment in (Get-XmlAttachments $rawMessage)) {
        $source = [pscustomobject]@{ uid = $uid; filename = $attachment.Filename; xmlSha256 = Get-Sha256 $attachment.Xml }
        $invoice = Parse-DteXml $attachment.Xml $source
        if ($null -ne $invoice) {
          $invoicesByKey[$invoice.normalizedKey] = $invoice
        }
      }
    } catch {
      $errors += [pscustomobject]@{ uid = $uid; message = $_.Exception.Message }
    }

    if (($processed % 100) -eq 0 -or $processed -eq $ids.Count) {
      Write-Host "Processed $processed/$($ids.Count). XML documents: $($invoicesByKey.Count)"
    }
  }

  $invoices = @($invoicesByKey.Values | Sort-Object @{ Expression = "fechaEmision"; Descending = $true }, @{ Expression = "folio"; Descending = $true })
  $payload = [pscustomobject]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    sourceMailbox = $env:DTE_IMAP_USER
    since = $Since
    messageCount = $ids.Count
    invoiceCount = $invoices.Count
    invoices = $invoices
    summaries = Summarize-Invoices $invoices
    errors = $errors
  }

  $fullOutputPath = Join-Path (Get-Location) $OutputPath
  $directory = Split-Path -Parent $fullOutputPath
  if (-not (Test-Path $directory)) { New-Item -ItemType Directory -Path $directory | Out-Null }
  $json = $payload | ConvertTo-Json -Depth 20
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($fullOutputPath, $json, $utf8NoBom)
  Write-Host "Wrote $fullOutputPath"
  Write-Host "Invoices: $($invoices.Count)"
  Write-Host "Errors: $($errors.Count)"
} finally {
  $writer.Dispose()
  $ssl.Dispose()
  $client.Dispose()
}
