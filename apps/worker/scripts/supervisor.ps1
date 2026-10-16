﻿# DOMUS Worker: supervisor que a tarefa do Windows roda (sem janela), com ícone na bandeja (ícones ocultos).
# - Ícone colorido = worker no ar; cinza = parado. Menu: Reiniciar, Parar/Iniciar, Abrir log, Sair.
# - Se o worker sair sozinho (erro, processo morto), sobe de novo em 10 s.
# - Se o supervisor morrer, o gatilho de 5 em 5 min da tarefa abre outro (IgnoreNew evita duplicar).
# - "Sair" grava .worker-data\parado com a hora do boot: a tarefa não religa até reiniciar o PC (ou pnpm worker:restart).
$raiz = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$dados = Join-Path $raiz ".worker-data"
$log = Join-Path $dados "worker.log"
$trava = Join-Path $dados "parado"
New-Item -ItemType Directory -Force $dados | Out-Null
Set-Location $raiz

$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToString("o")
if ((Test-Path $trava) -and (Get-Content $trava -Raw).Trim() -eq $boot) { exit 0 } # saiu pela bandeja nesta sessão do Windows
Remove-Item $trava -ErrorAction SilentlyContinue

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
function Registrar($m) { Add-Content -Encoding UTF8 $log "[$(Get-Date -Format 'dd/MM HH:mm:ss')] supervisor: $m" }

# ícone: favicon do DOMUS; versão cinza para "parado"
$png = [System.Drawing.Bitmap]::FromFile((Join-Path $raiz "apps\web\app\icon.png"))
$cor = New-Object System.Drawing.Bitmap $png, 32, 32
$cinza = New-Object System.Drawing.Bitmap 32, 32
$g = [System.Drawing.Graphics]::FromImage($cinza)
$matriz = New-Object System.Drawing.Imaging.ColorMatrix(, [single[][]]@(
  [single[]](0.3, 0.3, 0.3, 0, 0), [single[]](0.59, 0.59, 0.59, 0, 0), [single[]](0.11, 0.11, 0.11, 0, 0), [single[]](0, 0, 0, 0.6, 0), [single[]](0, 0, 0, 0, 1)))
$attr = New-Object System.Drawing.Imaging.ImageAttributes
$attr.SetColorMatrix($matriz)
$g.DrawImage($cor, (New-Object System.Drawing.Rectangle 0, 0, 32, 32), 0, 0, 32, 32, [System.Drawing.GraphicsUnit]::Pixel, $attr)
$g.Dispose()
$iconeOn = [System.Drawing.Icon]::FromHandle($cor.GetHicon())
$iconeOff = [System.Drawing.Icon]::FromHandle($cinza.GetHicon())

$script:proc = $null
$script:querRodando = $true
$script:desde = $null
$script:caiuEm = $null

function Iniciar {
  $psi = New-Object System.Diagnostics.ProcessStartInfo "cmd.exe", "/c `"`"$pnpm`" worker >> `"$log`" 2>&1`""
  $psi.WorkingDirectory = $raiz
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $script:proc = [System.Diagnostics.Process]::Start($psi)
  $script:desde = Get-Date
  $script:caiuEm = $null
  Registrar "iniciando worker"
}
function Parar {
  if ($script:proc -and -not $script:proc.HasExited) { taskkill /PID $script:proc.Id /T /F 2>$null | Out-Null }
  $script:proc = $null
}
function Atualizar {
  $on = $script:proc -and -not $script:proc.HasExited
  $tray.Icon = if ($on) { $iconeOn } else { $iconeOff }
  $tray.Text = if ($on) { "DOMUS Worker · no ar desde $($script:desde.ToString('HH:mm'))" } elseif ($script:querRodando) { "DOMUS Worker · reiniciando…" } else { "DOMUS Worker · parado" }
  $itemStatus.Text = $tray.Text
  $itemParar.Text = if ($script:querRodando) { "Parar worker" } else { "Iniciar worker" }
}

$tray = New-Object System.Windows.Forms.NotifyIcon
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$itemStatus = $menu.Items.Add("DOMUS Worker")
$itemStatus.Enabled = $false
[void]$menu.Items.Add("-")
$menu.Items.Add("Reiniciar worker").add_Click({ Registrar "reiniciar pela bandeja"; $script:querRodando = $true; Parar; Iniciar; Atualizar })
$itemParar = $menu.Items.Add("Parar worker")
$itemParar.add_Click({
  if ($script:querRodando) { Registrar "parado pela bandeja"; $script:querRodando = $false; Parar } else { $script:querRodando = $true; Iniciar }
  Atualizar
})
$menu.Items.Add("Abrir log").add_Click({ Start-Process notepad.exe $log })
[void]$menu.Items.Add("-")
$menu.Items.Add("Sair (até reiniciar o PC)").add_Click({
  Registrar "saiu pela bandeja"
  Set-Content $trava $boot
  Parar
  $tray.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})
$tray.ContextMenuStrip = $menu
$tray.add_DoubleClick({ Start-Process notepad.exe $log })
$tray.Visible = $true

# vigia: worker caiu sozinho → espera 10 s e sobe de novo
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.add_Tick({
  if ($script:querRodando -and $script:proc -and $script:proc.HasExited) {
    if (-not $script:caiuEm) { $script:caiuEm = Get-Date; Registrar "worker saiu (código $($script:proc.ExitCode)), reiniciando em 10 s" }
    elseif (((Get-Date) - $script:caiuEm).TotalSeconds -ge 10) { Iniciar }
  }
  Atualizar
})

Iniciar
Atualizar
$timer.Start()
[System.Windows.Forms.Application]::Run()
Parar
$tray.Dispose()
