# Reinicia o DOMUS Worker da tarefa do Windows (para pegar código novo).
# Stop-ScheduledTask só mata o cmd.exe: o node do worker ficaria órfão segurando a trava, e o novo sairia na hora.
#   pnpm worker:restart
$nos = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'pnpm\.cjs"?\s+"?worker"?\s*$|--filter worker start|tsx.*src/index\.ts' } # "worker" exato: não pega o próprio worker:restart
Stop-ScheduledTask -TaskName "DOMUS Worker" -ErrorAction SilentlyContinue
# a tarefa roda conhost --headless → powershell supervisor.ps1: o Stop mata só o conhost; o supervisor ficaria vivo
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'supervisor\.ps1' } |
  ForEach-Object { taskkill /PID $_.ProcessId /T /F 2>$null | Out-Null }
foreach ($n in $nos) { taskkill /PID $n.ProcessId /T /F 2>$null | Out-Null }
Start-Sleep 2
Remove-Item (Join-Path $PSScriptRoot "..\..\..\.worker-data\parado") -ErrorAction SilentlyContinue # saiu pela bandeja: restart manual religa
Start-ScheduledTask -TaskName "DOMUS Worker"
Write-Host "Worker reiniciado ($($nos.Count) processo(s) antigo(s) encerrado(s)). Log: .worker-data\worker.log"
