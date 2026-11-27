# Run from the repository where the developer will work.
[CmdletBinding()]
param(
    [string] $Email,
    [ValidateSet('Claude', 'Codex')][string] $Client,
    [switch] $Revoke
)
$ErrorActionPreference = 'Stop'
$ApiBase = [uri] 'http://127.0.0.1:8080'
function Update-DeveloperToken {
    if (!$Email) { $Email = Read-Host 'F1 Dev email' }
    $password = Read-Host "F1 password for $Email" -AsSecureString
    $credential = [pscredential]::new($Email, $password)
    $sessionHeaders = $null
    try {
        $session = Invoke-RestMethod -Method Post -Uri ([uri]::new($ApiBase, '/api/auth/login')) -MaximumRedirection 0 -ContentType 'application/json' -Body (@{
            email = $Email
            password = $credential.GetNetworkCredential().Password
        } | ConvertTo-Json -Compress)
        $sessionHeaders = @{ Authorization = "Bearer $($session.token)" }
        $tokenUri = [uri]::new($ApiBase, '/api/auth/dev-token')
        if ($Revoke) {
            Invoke-RestMethod -Method Delete -Uri $tokenUri -Headers $sessionHeaders -MaximumRedirection 0 | Out-Null
            Remove-Item Env:F1_DEV_TOKEN -ErrorAction SilentlyContinue
            Write-Host 'F1 developer token revoked.'
        } else {
            $issued = Invoke-RestMethod -Method Post -Uri $tokenUri -Headers $sessionHeaders -MaximumRedirection 0
            $env:F1_DEV_TOKEN = $issued.token
            Write-Host "F1 developer token is ready in this terminal until $($issued.expiresAt)."
        }
    } finally {
        $password.Dispose()
        if ($sessionHeaders) {
            try {
                Invoke-RestMethod -Method Delete -Uri ([uri]::new($ApiBase, '/api/auth/session')) -Headers $sessionHeaders -MaximumRedirection 0 | Out-Null
            } catch {
                Write-Warning 'Could not end the temporary sign-in session.'
            }
        }
    }
}
if ($Revoke -or $Email -or !$env:F1_DEV_TOKEN) {
    Update-DeveloperToken
}
if ($Revoke) { return }
switch ($Client) {
    'Claude' {
        $configPath = Join-Path (Split-Path -Parent $PSScriptRoot) '.mcp.json'
        & claude --mcp-config $configPath
    }
    'Codex' {
        & codex -c 'mcp_servers.f1-tickets.url="http://127.0.0.1:8080/mcp"' -c 'mcp_servers.f1-tickets.bearer_token_env_var="F1_DEV_TOKEN"'
    }
}
