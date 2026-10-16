# DOMUS Worker: supervisor que a tarefa do Windows roda (janela oculta).
# Se o worker sair por qualquer motivo (erro, Ctrl+C, processo morto), sobe de novo em 10 s.
# Se o próprio supervisor morrer, o gatilho de 5 em 5 min da tarefa abre outro (IgnoreNew evita duplicar).
$raiz = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
$log = Join-Path $raiz ".worker-data\worker.log"
New-Item -ItemType Directory -Force (Join-Path $raiz ".worker-data") | Out-Null
Set-Location $raiz

while ($true) {
  Add-Content $log "[$(Get-Date -Format 'dd/MM HH:mm:ss')] supervisor: iniciando worker"
  & cmd.exe /c "`"$pnpm`" worker >> `"$log`" 2>&1"
  Add-Content $log "[$(Get-Date -Format 'dd/MM HH:mm:ss')] supervisor: worker saiu (código $LASTEXITCODE), reiniciando em 10 s"
  Start-Sleep 10
}
