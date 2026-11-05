param(
    [switch]$SkipBrowser,
    [string]$BrowserPath
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$indexPath = Join-Path $projectRoot 'index.html'
$utf8 = New-Object System.Text.UTF8Encoding($false, $true)
$html = $utf8.GetString([System.IO.File]::ReadAllBytes($indexPath))
$issues = New-Object 'System.Collections.Generic.List[string]'
$ids = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::Ordinal)

foreach ($match in [regex]::Matches($html, '(?i)\bid\s*=\s*["'']([^"'']+)["'']')) {
    if (-not $ids.Add($match.Groups[1].Value)) {
        $issues.Add('Duplicate ID: ' + $match.Groups[1].Value)
    }
}

$attributes = [regex]::Matches($html, '(?i)\b(?<attribute>href|src|for|aria-labelledby|aria-describedby)\s*=\s*["''](?<value>[^"'']*)["'']')
foreach ($match in $attributes) {
    $attribute = $match.Groups['attribute'].Value.ToLowerInvariant()
    $value = $match.Groups['value'].Value
    if ($attribute -in @('for', 'aria-labelledby', 'aria-describedby')) {
        foreach ($id in ($value -split '\s+' | Where-Object { $_ })) {
            if (-not $ids.Contains($id)) { $issues.Add('Missing referenced ID: ' + $id) }
        }
    } elseif ($value.StartsWith('#')) {
        $id = [System.Uri]::UnescapeDataString($value.Substring(1))
        if ($id -and -not $ids.Contains($id)) { $issues.Add('Missing anchor: ' + $value) }
    } elseif ($value -and $value -notmatch '^(?:[a-z][a-z0-9+.-]*:|//)') {
        $localPath = [System.Uri]::UnescapeDataString(($value -split '[?#]', 2)[0])
        $target = Join-Path $projectRoot ($localPath.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar))
        if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
            $issues.Add('Missing local asset or page: ' + $value)
        }
    }
}

if ($html -notmatch '(?i)<html\b[^>]*\blang=["'']ru["'']') { $issues.Add('Missing Russian document language') }
if ($html -notmatch '(?i)<meta\b[^>]*charset=["'']UTF-8["'']') { $issues.Add('Missing UTF-8 declaration') }
if ($issues.Count) { throw ($issues -join [Environment]::NewLine) }
Write-Output ('PASS: UTF-8, document metadata, {0} unique IDs, local assets and references.' -f $ids.Count)

if ($SkipBrowser) {
    Write-Output 'SKIP: browser checks were explicitly disabled.'
    return
}

if (-not $BrowserPath) {
    $candidates = @(
        (Join-Path ${env:ProgramFiles} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path ${env:ProgramFiles} 'Microsoft\Edge\Application\msedge.exe')
    )
    $BrowserPath = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}
if (-not $BrowserPath) {
    Write-Warning 'SKIP: Chrome/Edge was not found. Use -BrowserPath or run the manual checks in README.md.'
    return
}
if (-not (Test-Path -LiteralPath $BrowserPath -PathType Leaf)) { throw 'BrowserPath does not point to an executable.' }

$runId = [guid]::NewGuid().ToString('N')
$fixturePath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot ('.check-' + $runId + '.html')))
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$browserProfile = [System.IO.Path]::GetFullPath((Join-Path $tempRoot ('coffee-browser-check-' + $runId)))
$browserProcess = $null
try {
    $fixture = $html -replace '(?i)</body>', '<script src="scripts/browser-checks.js" defer></script></body>'
    [System.IO.File]::WriteAllText($fixturePath, $fixture, $utf8)
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $BrowserPath
    $fixtureUri = (New-Object System.Uri($fixturePath)).AbsoluteUri
    $start.Arguments = '--headless --disable-gpu --no-first-run --no-default-browser-check --disable-background-networking --disable-component-update --dump-dom --user-data-dir="' + $browserProfile + '" "' + $fixtureUri + '"'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = $utf8
    $browserProcess = New-Object System.Diagnostics.Process
    $browserProcess.StartInfo = $start
    if (-not $browserProcess.Start()) { throw 'Could not start the headless browser.' }
    $stdout = $browserProcess.StandardOutput.ReadToEndAsync()
    $stderr = $browserProcess.StandardError.ReadToEndAsync()
    if (-not $browserProcess.WaitForExit(25000)) { throw 'Browser checks timed out after 25 seconds.' }
    $dom = $stdout.GetAwaiter().GetResult()
    $browserErrors = $stderr.GetAwaiter().GetResult()
    $report = [regex]::Match($dom, '(?s)<pre\b[^>]*\bid="browser-check-results"[^>]*>(.*?)</pre>')
    if (-not $report.Success) { throw ('Browser checks did not produce results. ' + $browserErrors) }
    $checks = [System.Net.WebUtility]::HtmlDecode($report.Groups[1].Value) | ConvertFrom-Json
    foreach ($check in $checks) {
        if ($check.passed) { Write-Output ('PASS: ' + $check.name) }
        else { Write-Output ('FAIL: ' + $check.name + ' - ' + $check.error) }
    }
    if ($browserProcess.ExitCode -ne 0 -or $dom -notmatch 'data-browser-check-status="passed"' -or @($checks | Where-Object { -not $_.passed }).Count) {
        throw 'Browser checks failed.'
    }
} finally {
    if ($browserProcess) {
        if (-not $browserProcess.HasExited) { $browserProcess.Kill(); $browserProcess.WaitForExit(2000) | Out-Null }
        $browserProcess.Dispose()
    }
    # Remove only the exact, generated paths within the intended directories.
    if ([System.IO.Path]::GetDirectoryName($fixturePath) -eq $projectRoot -and [System.IO.Path]::GetFileName($fixturePath) -eq ('.check-' + $runId + '.html')) {
        if (Test-Path -LiteralPath $fixturePath) { Remove-Item -LiteralPath $fixturePath -Force }
    }
    if ([System.IO.Path]::GetDirectoryName($browserProfile).TrimEnd('\') -eq $tempRoot.TrimEnd('\') -and [System.IO.Path]::GetFileName($browserProfile) -eq ('coffee-browser-check-' + $runId)) {
        if (Test-Path -LiteralPath $browserProfile) { Remove-Item -LiteralPath $browserProfile -Recurse -Force -ErrorAction SilentlyContinue }
    }
}
