# DOMUS Worker: inicia junto com o Windows (Agendador de Tarefas, no logon do usuário atual).
# Sem PM2: supervisor.ps1 religa o worker se ele sair; a tarefa religa o supervisor a cada 5 min se ele morrer.
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

New-Item -ItemType Directory -Force (Join-Path $raiz ".worker-data") | Out-Null
$log = Join-Path $raiz ".worker-data\worker.log"
# O supervisor roda em janela oculta (ninguém fecha o console nem aperta Ctrl+C sem querer) e religa o worker se ele sair.
$supervisor = Join-Path $PSScriptRoot "supervisor.ps1"
$acao = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$supervisor`"" -WorkingDirectory $raiz
# Dois gatilhos: no logon e a cada 5 min o dia todo. O de 5 min é um gatilho de horário próprio: a repetição presa ao
# logon só vale se o logon disparou (worker iniciado à mão ficava sem ela). Com IgnoreNew, se já está no ar, nada acontece.
$logon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$cinco = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -Hidden
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $logon, $cinco -Settings $config -Description "Fila de jobs e IA do DOMUS AdPilot" -Force | Out-Null
Write-Host "Tarefa '$nome' instalada. Ela inicia no próximo logon; para iniciar agora: Start-ScheduledTask -TaskName '$nome'"
Write-Host "Log: $log"
