param(
    [ValidatePattern('^[a-z][a-z0-9_]{0,62}$')]
    [string]$Database = 'f1_portfolio'
)

$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    docker compose up --wait postgres
    if ($LASTEXITCODE -ne 0) { throw 'Could not start PostgreSQL.' }

    $exists = docker compose exec -T postgres psql -X -U f1 -d postgres -At -c "SELECT 1 FROM pg_database WHERE datname = '$Database';"
    if ($LASTEXITCODE -ne 0) { throw 'Could not check the local databases.' }

    if ($exists -ne '1') {
        docker compose exec -T postgres createdb -U f1 $Database
        if ($LASTEXITCODE -ne 0) { throw "Could not create $Database." }
    }

    $migrations = Get-ChildItem -LiteralPath backend/migrations -Filter '*.sql' -File | Sort-Object Name
    foreach ($migration in $migrations) {
        Get-Content -Raw -LiteralPath $migration.FullName | docker compose exec -T postgres psql -X -U f1 -d $Database -v ON_ERROR_STOP=1 -q
        if ($LASTEXITCODE -ne 0) { throw "Migration failed at $($migration.Name)." }
    }

    Write-Output "Local database $Database is ready."
} finally {
    Pop-Location
}
