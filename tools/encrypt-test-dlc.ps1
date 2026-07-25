$envFilePath = Join-Path $PSScriptRoot "..\local-test-server\.env"
$key = ""

if (Test-Path $envFilePath) {
    foreach ($line in Get-Content $envFilePath) {
        if ($line -match "^DLC_AES_KEY_BASE64=(.*)") {
            $key = $matches[1]
            break
        }
    }
}

if (-not $key) {
    Write-Host "Fehler: DLC_AES_KEY_BASE64 nicht in $envFilePath gefunden!" -ForegroundColor Red
    exit 1
}

$inputBundle = "C:\Users\brand\My project\Assets\BuiltAssetBundles\test-dlc"
$outputBytes = "C:\Users\brand\My project\Assets\real-dlc.bytes"

if (-not (Test-Path $inputBundle)) {
    Write-Host "Fehler: AssetBundle nicht gefunden: $inputBundle" -ForegroundColor Red
    Write-Host "Bitte baue das AssetBundle zuerst in Unity (Assets -> Build AssetBundles)." -ForegroundColor Yellow
    exit 1
}

Write-Host "Verschlüssele AssetBundle mit Key aus .env..." -ForegroundColor Cyan
node (Join-Path $PSScriptRoot "encrypt-dlc-bundle.mjs") $inputBundle $outputBytes --key-base64 $key

Write-Host "Fertig! Die verschlüsselte Datei liegt unter: unity-client\Assets\real-dlc.bytes" -ForegroundColor Green
