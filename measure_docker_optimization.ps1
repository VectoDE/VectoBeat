# Docker Optimization Measurement Script
# This script builds the optimized images, reports their size and history, and cleans up.

$ErrorActionPreference = "Stop"

function Measure-Build {
    param (
        [string]$ServiceName,
        [string]$Dockerfile,
        [string]$Context,
        [string]$ImageName
    )

    Write-Host "============================================================"
    Write-Host " Building $ServiceName ($ImageName) ..."
    Write-Host " Dockerfile: $Dockerfile"
    Write-Host " Context:    $Context"
    Write-Host "============================================================"

    # Build the image
    # Using --no-cache to measure full build size without cache benefits initially,
    # or remove --no-cache to test cache efficiency as requested.
    # User asked to "check cache efficiency", implies we might want to run it twice or just standard build.
    # We will do a standard build.
    docker build -f $Dockerfile -t $ImageName $Context

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed for $ServiceName"
        return
    }

    Write-Host "`n[SIZE REPORT]"
    docker image inspect $ImageName | ConvertFrom-Json | Select-Object -ExpandProperty Size | ForEach-Object {
        $mb = $_ / 1MB
        Write-Host "Total Size: $(" {0:N2} MB" -f $mb)"
    }

    Write-Host "`n[LAYER HISTORY]"
    docker image history $ImageName --no-trunc --format "table {{.Size}}\t{{.CreatedBy}}" | Select-Object -First 10
    
    Write-Host "`n[DISK USAGE]"
    docker system df
}

# Measure Frontend
Measure-Build -ServiceName "Frontend" -Dockerfile "frontend/Dockerfile" -Context "." -ImageName "vectobeat-frontend:optimized"

# Measure Bot
Measure-Build -ServiceName "Bot" -Dockerfile "bot/Dockerfile" -Context "." -ImageName "vectobeat-bot:optimized"

Write-Host "`n============================================================"
Write-Host " Cleaning up..."
Write-Host "============================================================"

# Prune as requested to remove intermediate layers
docker system prune -f

Write-Host "Done. Optimization verification complete."
