# Builds a library of Minecraft item icons sized for Stream Deck keys, usable on ANY button —
# OBS scenes, folders, website shortcuts, macros, other plugins' actions. Nothing here is tied
# to DeckCraft Hotbar.
#
#   npm run icons:library
#   powershell -ExecutionPolicy Bypass -File scripts\make-deck-icon-library.ps1
#
# Input : com.fluffybacon.deckcraft-hotbar.sdPlugin/imgs/items/*.png  (16x16, from icons:extract)
# Output: dist/minecraft-deck-icons/*.png                             (144x144, transparent)
#
# Upscaled with NEAREST NEIGHBOUR so the pixel art stays crisp instead of turning to mush, and
# alpha is preserved so icons sit on whatever key colour you choose.
#
# These are Minecraft's own textures, read from your local installation. They are for your own
# personal Stream Deck use — do not redistribute them.

param(
    [int]$Size = 144,
    [switch]$DarkBackground   # optional: flatten onto the Stream Deck's dark grey instead of alpha
)

Add-Type -AssemblyName System.Drawing

$scriptDir = Split-Path -Parent $PSScriptRoot
$inDir = Join-Path $scriptDir 'com.fluffybacon.deckcraft-hotbar.sdPlugin\imgs\items'
$outDir = Join-Path $scriptDir 'dist\minecraft-deck-icons'

if (-not (Test-Path $inDir)) {
    Write-Error "No extracted textures found at $inDir. Run 'npm run icons:extract' first."
    exit 1
}

if (Test-Path $outDir) { Remove-Item -Recurse -Force $outDir }
New-Item -ItemType Directory -Force $outDir | Out-Null

$files = Get-ChildItem -Path $inDir -Filter *.png
$total = $files.Count
$done = 0
$animated = 0

foreach ($f in $files) {
    $src = [System.Drawing.Image]::FromFile($f.FullName)
    try {
        # Animated textures are stored as a vertical strip of frames; take the first frame only.
        $srcW = $src.Width
        $srcH = $src.Height
        $frameH = $srcH
        if ($srcH -gt $srcW) { $frameH = $srcW; $animated++ }

        $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
            if ($DarkBackground) { $g.Clear([System.Drawing.Color]::FromArgb(255, 29, 32, 38)) }
            # Nearest neighbour + Half pixel offset keeps blocky edges exact at integer scales.
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
            $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
            $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

            $destRect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
            $g.DrawImage($src, $destRect, 0, 0, $srcW, $frameH, [System.Drawing.GraphicsUnit]::Pixel)
        } finally { $g.Dispose() }

        $bmp.Save((Join-Path $outDir $f.Name), [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        $done++
        if ($done % 250 -eq 0) { Write-Output "  ...$done / $total" }
    } finally { $src.Dispose() }
}

$mb = [math]::Round(((Get-ChildItem $outDir | Measure-Object -Property Length -Sum).Sum / 1MB), 1)
Write-Output ""
Write-Output "Wrote $done icons at ${Size}x${Size} to:"
Write-Output "  $outDir"
Write-Output "  $mb MB total; $animated animated textures cropped to their first frame"
Write-Output ""
Write-Output "To use: in the Stream Deck app, select any key, then drag one of these PNGs onto"
Write-Output "its image well (or use 'Set from file'). Works with any action, not just DeckCraft."
