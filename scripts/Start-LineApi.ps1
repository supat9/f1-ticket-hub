#Requires -Version 7.0
[CmdletBinding()]
param(
    [string]$OfficialAccountId,
    [uri]$PublicUrl,
    [uri]$WebhookUrl,
    [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'

if ($PublicUrl -and (-not $PublicUrl.IsAbsoluteUri -or $PublicUrl.Scheme -ne 'https' -or
    $PublicUrl.AbsolutePath -ne '/' -or $PublicUrl.Query -or $PublicUrl.Fragment -or $PublicUrl.UserInfo)) {
    throw 'PublicUrl must be an HTTPS origin, such as https://f1.example.com.'
}
if ($WebhookUrl -and (-not $VerifyOnly -or -not $WebhookUrl.IsAbsoluteUri -or
    $WebhookUrl.Scheme -ne 'https' -or $WebhookUrl.AbsolutePath -cne '/api/line/webhook' -or
    $WebhookUrl.Query -or $WebhookUrl.Fragment -or $WebhookUrl.UserInfo)) {
    throw 'Use -VerifyOnly -WebhookUrl with an HTTPS URL ending in /api/line/webhook.'
}

if (-not $OfficialAccountId) {
    $OfficialAccountId = Read-Host 'LINE Official Account Basic ID (including @)'
}
$OfficialAccountId = $OfficialAccountId.Trim()
if ($OfficialAccountId -notmatch '^@[A-Za-z0-9_.-]+$') {
    throw 'Enter the Official Account Basic ID including its leading @.'
}

$lineToken = Read-Host 'LINE Channel Access Token' -AsSecureString
$lineApiOptions = @{
    Authentication = 'Bearer'
    Token = $lineToken
    TimeoutSec = 15
    MaximumRedirection = 0
}
try {
    $bot = Invoke-RestMethod @lineApiOptions -Uri 'https://api.line.me/v2/bot/info'
} catch {
    throw 'LINE could not verify the access token. Check that it is valid for this Messaging API channel.'
}
if ($bot.basicId -cne $OfficialAccountId) {
    throw 'The access token belongs to a different LINE Official Account.'
}
Write-Host "LINE access token verified for $OfficialAccountId."

if ($VerifyOnly) {
    if ($WebhookUrl) {
        try {
            $result = Invoke-RestMethod @lineApiOptions -Uri 'https://api.line.me/v2/bot/channel/webhook/test' `
                -Method Post -ContentType 'application/json' `
                -Body (@{ endpoint = $WebhookUrl.AbsoluteUri } | ConvertTo-Json -Compress)
        } catch {
            throw 'LINE could not run the webhook test. Check the channel and the HTTPS URL.'
        }
        if (-not $result.success) {
            throw "LINE could not verify the webhook (status $($result.statusCode)). Check HTTPS routing and the Channel Secret."
        }
        Write-Host 'LINE webhook verification passed. Register this URL and enable Use webhook in LINE Developers Console.'
    }
    return
}

$lineSecret = Read-Host 'LINE Channel Secret' -AsSecureString
if ($lineSecret.Length -eq 0) {
    throw 'Channel Secret is required.'
}

$lineEnvironment = @{}
foreach ($name in 'LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN', 'LINE_OFFICIAL_ACCOUNT_ID', 'F1_PUBLIC_URL') {
    $lineEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$backendPath = Join-Path $PSScriptRoot '../backend'
Push-Location -LiteralPath $backendPath
try {
    $env:LINE_CHANNEL_SECRET = [System.Net.NetworkCredential]::new('', $lineSecret).Password
    $env:LINE_CHANNEL_ACCESS_TOKEN = [System.Net.NetworkCredential]::new('', $lineToken).Password
    $env:LINE_OFFICIAL_ACCOUNT_ID = $OfficialAccountId
    if ($PublicUrl) {
        $env:F1_PUBLIC_URL = $PublicUrl.AbsoluteUri
    }
    Write-Host 'Starting the F1 API with LINE enabled. Keep this terminal open.'
    go run ./cmd/api
    if ($LASTEXITCODE -ne 0) {
        throw 'F1 API stopped with an error. Check that PostgreSQL is running and that the API port is free.'
    }
} finally {
    foreach ($name in $lineEnvironment.Keys) {
        if ($null -eq $lineEnvironment[$name]) {
            Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
        } else {
            [Environment]::SetEnvironmentVariable($name, $lineEnvironment[$name], 'Process')
        }
    }
    Pop-Location
}
