$deadline = Get-Date "11:05:00"
while ($true) {
    if ((Get-Date) -ge $deadline) {
        Write-Output "11:05 도달 - 스케줄러 계속 살아있음, 모니터링 종료"
        break
    }
    $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*scheduler*' }
    if (-not $procs -or $procs.Count -eq 0) {
        Write-Output "경고: 스케줄러 프로세스가 죽었습니다! 감지 시각 $(Get-Date -Format 'HH:mm:ss')"
        break
    }
    Start-Sleep -Seconds 30
}
