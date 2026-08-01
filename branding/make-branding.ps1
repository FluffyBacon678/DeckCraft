# Generates every branding asset from the two source artworks.
#
#   powershell -ExecutionPolicy Bypass -File branding\make-branding.ps1
#
# Sources (checked into branding/source):
#   icon-source.png    square artwork  -> Mod Menu icon, Modrinth icon, Stream Deck plugin icon
#   banner-source.png  wide artwork    -> Modrinth gallery / README banner
#
# Uses .NET System.Drawing (built into Windows) with high-quality bicubic resampling and
# preserves alpha, so no image library is needed.

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$branding = Join-Path $root 'branding'
$source = Join-Path $branding 'source'

function Resize-Image {
    param(
        [string]$InPath,
        [string]$OutPath,
        [int]$Width,
        [int]$Height
    )
    if (-not (Test-Path $InPath)) { Write-Error "missing source: $InPath"; return }

    $src = [System.Drawing.Image]::FromFile($InPath)
    try {
        $bmp = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
            $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)))
        } finally { $g.Dispose() }

        $dir = Split-Path -Parent $OutPath
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
        $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        $kb = [math]::Round((Get-Item $OutPath).Length / 1KB, 1)
        Write-Output ("  {0,-62} {1}x{2}  {3} KB" -f (Split-Path -Leaf $OutPath), $Width, $Height, $kb)
    } finally { $src.Dispose() }
}

$iconSrc = Join-Path $source 'icon-source.png'
$bannerSrc = Join-Path $source 'banner-source.png'

Write-Output 'Branding assets:'

# --- Modrinth ---------------------------------------------------------------
# Modrinth project icon: square, 512x512 is the sweet spot (must stay under 1 MB).
Resize-Image $iconSrc (Join-Path $branding 'modrinth-icon-512.png') 512 512

# Gallery / banner image. Keep 16:9-ish; 1920 wide is plenty for the gallery.
$b = [System.Drawing.Image]::FromFile($bannerSrc)
$bw = $b.Width; $bh = $b.Height; $b.Dispose()
$targetW = 1920
$targetH = [int][math]::Round($bh * ($targetW / $bw))
$bannerPng = Join-Path $branding 'modrinth-banner-1920.png'
Resize-Image $bannerSrc $bannerPng $targetW $targetH

# The banner is photographic-style art, so PNG is wasteful (~3.5 MB). Also emit a JPEG at
# quality 90 — visually identical in a gallery at roughly a tenth the size. Upload whichever
# the host prefers; Modrinth accepts both.
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 90)
$pngImg = [System.Drawing.Image]::FromFile($bannerPng)
try {
    # Flatten onto opaque black first — JPEG has no alpha channel.
    $flat = New-Object System.Drawing.Bitmap($pngImg.Width, $pngImg.Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $fg = [System.Drawing.Graphics]::FromImage($flat)
    try {
        $fg.Clear([System.Drawing.Color]::Black)
        $fg.DrawImage($pngImg, 0, 0, $pngImg.Width, $pngImg.Height)
    } finally { $fg.Dispose() }
    $bannerJpg = Join-Path $branding 'modrinth-banner-1920.jpg'
    $flat.Save($bannerJpg, $jpegCodec, $encParams)
    $flat.Dispose()
    $kb = [math]::Round((Get-Item $bannerJpg).Length / 1KB, 1)
    Write-Output ("  {0,-62} {1}x{2}  {3} KB" -f 'modrinth-banner-1920.jpg', $targetW, $targetH, $kb)
} finally { $pngImg.Dispose() }

# --- Fabric Mod Menu --------------------------------------------------------
# fabric.mod.json "icon" — Mod Menu renders it small, 256 stays crisp on HiDPI.
Resize-Image $iconSrc (Join-Path $root 'minecraft-fabric\src\main\resources\assets\deckcraft_hotbar\icon.png') 256 256

# --- Stream Deck plugin -----------------------------------------------------
# The plugin/marketplace icon is shown large enough for the full artwork to read.
# NOTE: category-icon and the action icon stay as the simple drawn hotbar mark —
# this detailed artwork turns to mush at 20x20.
$sd = Join-Path $root 'streamdeck-plugin\com.fluffybacon.deckcraft-hotbar.sdPlugin\imgs\plugin'
Resize-Image $iconSrc (Join-Path $sd 'marketplace.png') 256 256
Resize-Image $iconSrc (Join-Path $sd 'marketplace@2x.png') 512 512

Write-Output 'Done.'
