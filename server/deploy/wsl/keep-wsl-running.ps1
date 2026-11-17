# 학교 Windows PC에서 관리자 PowerShell로 한 번 실행한다.
# Windows가 켜질 때 WSL 우분투를 띄우고 계속 살아 있게 한다(로그인하지 않아도 동작).
# WSL은 실행 중인 wsl.exe가 없으면 잠시 뒤 꺼지므로, sleep infinity를 붙잡아 둔다.
param(
  [string]$Distro = "Ubuntu-24.04",
  [string]$TaskName = "Talju WSL keepalive"
)
$user = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\wsl.exe" -Argument "-d $Distro --exec /bin/sleep infinity"
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
$password = Read-Host -AsSecureString "$user 의 Windows 비밀번호(로그인 없이 실행하려면 필요)"
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -User $user -Password $plain -RunLevel Highest -Force
Start-ScheduledTask -TaskName $TaskName
Write-Host "등록 완료. 확인: wsl -l -v 에서 $Distro 가 Running 이어야 한다."
