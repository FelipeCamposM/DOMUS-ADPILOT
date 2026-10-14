# DOMUS Worker: inicia junto com o Windows (Agendador de Tarefas, no logon do usuário atual).
# Sem PM2: o Agendador reinicia o worker se ele cair (até 999 vezes, 1 minuto de intervalo).
#
#   powershell -ExecutionPolicy Bypass -File apps\worker\scripts\inicializacao.ps1            instala
#   powershell -ExecutionPolicy Bypass -File apps\worker\scripts\inicializacao.ps1 -Remover   remove
#
# Log: .worker-data\worker.log na raiz do projeto.
param([switch]$Remover)

$nome = "DOMUS Worker"
$raiz = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path

if ($Remover) {
  Unregister-ScheduledTask -TaskName $nome -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Tarefa '$nome' removida."
  exit 0
}

# pnpm.cmd (não o pnpm.ps1: pelo cmd.exe, o .ps1 abre no Bloco de Notas em vez de rodar)
$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
New-Item -ItemType Directory -Force (Join-Path $raiz ".worker-data") | Out-Null
$log = Join-Path $raiz ".worker-data\worker.log"
# cmd /c mantém o código de saída: se o worker cair, a tarefa "falha" e o Agendador reinicia.
$acao = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"`"$pnpm`" worker >> `"$log`" 2>&1`"" -WorkingDirectory $raiz
$gatilho = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -Hidden
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $config -Description "Fila de jobs e IA do DOMUS AdPilot" -Force | Out-Null
Write-Host "Tarefa '$nome' instalada. Ela inicia no próximo logon; para iniciar agora: Start-ScheduledTask -TaskName '$nome'"
Write-Host "Log: $log"
