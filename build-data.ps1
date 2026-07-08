# Regenere data.js a partir de subli.json (a relancer si subli.json change)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$j = Get-Content (Join-Path $root 'subli.json') -Raw | ConvertFrom-Json

$out = @()
foreach ($s in ($j.sublimations | Sort-Object name_shard)) {
    $out += [ordered]@{
        name   = $s.name_shard
        colors = @($s.colors_needed | ForEach-Object { [int]$_.id_color })
        max    = $s.max_usage
    }
}

$json = ConvertTo-Json -InputObject $out -Compress -Depth 4
$content = "// Genere par build-data.ps1 a partir de subli.json - ne pas editer a la main`n" +
           "// colors: 1=rouge, 2=vert, 3=bleu`n" +
           "const SUBLIMATIONS = $json;`n"
[IO.File]::WriteAllText((Join-Path $root 'data.js'), $content, (New-Object System.Text.UTF8Encoding $false))
Write-Host "data.js genere : $($out.Count) sublimations"
