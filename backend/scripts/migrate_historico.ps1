# ═══════════════════════════════════════════════════════════════
#  Migração Histórica – Margem UniversoBox Hub
#  Preencha as 4 variáveis abaixo e execute no PowerShell:
#     .\backend\scripts\migrate_historico.ps1
# ═══════════════════════════════════════════════════════════════

# ── PREENCHA AQUI ────────────────────────────────────────────────
$FIREBASE_API_KEY = "AIzaSyAYlD4nJq3V4P8Z4ZzoLg8Xvk6i6ITb0bk"
$ADMIN_EMAIL      = "militao46@gmail.com"
$ADMIN_PASSWORD   = "Lda@q1w2e3"
$TENANT_ID        = "universolab"
$API_URL          = "https://universoboxhub.up.railway.app"
# ─────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Migracao Historica - Margem UniversoBox Hub"
Write-Host "  API: $API_URL"
Write-Host "  Tenant: $TENANT_ID"
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# Passo 1 – Login Firebase
Write-Host "Passo 1 - Login no Firebase Auth..." -ForegroundColor Yellow
$loginUrl = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$FIREBASE_API_KEY"
$loginBody = @{ email = $ADMIN_EMAIL; password = $ADMIN_PASSWORD; returnSecureToken = $true } | ConvertTo-Json
try {
    $loginResp = Invoke-RestMethod -Uri $loginUrl -Method Post -Body $loginBody -ContentType "application/json"
} catch {
    Write-Host "ERRO no login Firebase: $_" -ForegroundColor Red
    exit 1
}
$idToken   = $loginResp.idToken
$refreshTk = $loginResp.refreshToken
Write-Host "  OK - uid: $($loginResp.localId)" -ForegroundColor Green

# Passo 2 – Provisionar tenant (garante custom claims)
Write-Host "Passo 2 - Provisionando tenant..." -ForegroundColor Yellow
$provBody = @{ tenantId = $TENANT_ID } | ConvertTo-Json
try {
    $provResp = Invoke-RestMethod -Uri "$API_URL/auth/provision" -Method Post `
        -Body $provBody -ContentType "application/json" `
        -Headers @{ Authorization = "Bearer $idToken" }
} catch {
    Write-Host "ERRO no provision: $_" -ForegroundColor Red
    Write-Host "Verifique se o usuario e membro de tenants/$TENANT_ID/members/{uid}" -ForegroundColor Red
    exit 1
}
Write-Host "  OK - Claims definidas" -ForegroundColor Green

# Passo 3 – Renovar token com custom claims
Write-Host "Passo 3 - Renovando token com custom claims..." -ForegroundColor Yellow
$refreshUrl  = "https://securetoken.googleapis.com/v1/token?key=$FIREBASE_API_KEY"
$refreshBody = @{ grant_type = "refresh_token"; refresh_token = $refreshTk } | ConvertTo-Json
try {
    $refreshResp = Invoke-RestMethod -Uri $refreshUrl -Method Post -Body $refreshBody -ContentType "application/json"
} catch {
    Write-Host "ERRO ao renovar token: $_" -ForegroundColor Red
    exit 1
}
$freshToken = $refreshResp.id_token
Write-Host "  OK - Token renovado" -ForegroundColor Green

# Passo 4 – Importar historico
Write-Host "Passo 4 - Importando historico Sheets -> Firestore..." -ForegroundColor Yellow
try {
    $importResp = Invoke-RestMethod -Uri "$API_URL/api/margem-v2/importar-historico" -Method Post `
        -Body "{}" -ContentType "application/json" `
        -Headers @{ Authorization = "Bearer $freshToken" }
} catch {
    Write-Host "ERRO na importacao: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "MIGRACAO CONCLUIDA!" -ForegroundColor Green
Write-Host "  Meses importados: $($importResp.importados)"
Write-Host "  Colecao Firestore: fin_margem_mensal"
Write-Host ""
Write-Host "Meses com fonte='automatico' nao foram sobrescritos." -ForegroundColor Gray
