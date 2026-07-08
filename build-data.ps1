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

# Chasses d'enchantement : couleur, objets ou le bonus est double, formule par palier
# (valeur au niveau L = plancher(offset + ratio * L), paliers [minLvl, maxLvl, offset, ratio])
$eqMap = @{
    'helmet' = @('chapeau'); 'cape' = @('cape'); 'boots' = @('bottes')
    'epaulettes' = @('epaulettes'); 'belt' = @('ceinture')
    'one_handed_weapon' = @('cac'); 'two_handed_weapon' = @('cac')
    'breastplate' = @('plastron'); 'necklace' = @('amulette')
    'ring' = @('anneau1', 'anneau2')
}
$shards = @()
foreach ($sh in $j.shards) {
    $doubles = @()
    foreach ($db in $sh.double_bonus) {
        $img = $db.image_equipment_type -replace '\.png', ''
        if ($eqMap.ContainsKey($img)) { $doubles += $eqMap[$img] }
    }
    $brackets = @()
    foreach ($e in ($sh.effects | Sort-Object container_min_level)) {
        $brackets += ,@([int]$e.container_min_level, [int]$e.container_max_level,
                        [double]$e.values.damage, [double]$e.values.ratio)
    }
    $shards += [ordered]@{
        name     = $sh.name_shard
        color    = [int]$sh.id_color
        doubleOn = @($doubles | Sort-Object -Unique)
        brackets = $brackets
    }
}

$json = ConvertTo-Json -InputObject $out -Compress -Depth 4
$jsonShards = ConvertTo-Json -InputObject $shards -Compress -Depth 5
$content = "// Genere par build-data.ps1 a partir de subli.json - ne pas editer a la main`n" +
           "// colors: 1=rouge, 2=vert, 3=bleu`n" +
           "const SUBLIMATIONS = $json;`n" +
           "const SHARDS = $jsonShards;`n"
[IO.File]::WriteAllText((Join-Path $root 'data.js'), $content, (New-Object System.Text.UTF8Encoding $false))
Write-Host "data.js genere : $($out.Count) sublimations, $($shards.Count) chasses"
