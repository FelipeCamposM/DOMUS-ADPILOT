# Reinicia o DOMUS Worker da tarefa do Windows (para pegar código novo).
# Stop-ScheduledTask só mata o cmd.exe: o node do worker ficaria órfão segurando a trava, e o novo sairia na hora.
#   pnpm worker:restart
$nos = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'pnpm\.cjs"?\s+"?worker"?\s*$|--filter worker start|tsx.*src/index\.ts' } # "worker" exato: não pega o próprio worker:restart
Stop-ScheduledTask -TaskName "DOMUS Worker" -ErrorAction SilentlyContinue
foreach ($n in $nos) { taskkill /PID $n.ProcessId /T /F 2>$null | Out-Null }
Start-Sleep 2
Start-ScheduledTask -TaskName "DOMUS Worker"
Write-Host "Worker reiniciado ($($nos.Count) processo(s) antigo(s) encerrado(s)). Log: .worker-data\worker.log"
