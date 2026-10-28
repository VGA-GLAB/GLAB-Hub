param(
  [Parameter(Mandatory=$true)][string]$CertificateThumbprint,
  [Parameter(Mandatory=$true)][string]$PayloadPath,
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9][a-z0-9-]{0,79}$')][string]$Id,
  [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$')][string]$Version,
  [Parameter(Mandatory=$true)][ValidateSet('windows','macos','linux','any')][string]$Platform,
  [Parameter(Mandatory=$true)][ValidateSet('runtime','plugin','sdk')][string]$Kind
)
$ErrorActionPreference = 'Stop'
if ($CertificateThumbprint -notmatch '^[a-fA-F0-9]{40}$') { throw 'Invalid certificate selector' }
$file = Get-Item -LiteralPath $PayloadPath
if ($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $file.Length -lt 1 -or $file.Length -gt 16MB) { throw 'Invalid payload file' }
if ($file.Name -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$') { throw 'Invalid payload name' }
if (Test-Path -LiteralPath $OutputPath) { throw 'Refusing to overwrite an existing release' }
$cert = Get-Item -LiteralPath "Cert:\CurrentUser\My\$CertificateThumbprint"
$rsa = $null
try {
  if ($cert.NotBefore -gt (Get-Date) -or $cert.NotAfter -le (Get-Date) -or -not $cert.HasPrivateKey) { throw 'Certificate unavailable or expired' }
  if (-not ($cert.EnhancedKeyUsageList | Where-Object { $_.ObjectId -eq '1.3.6.1.5.5.7.3.3' })) { throw 'Code-signing certificate required' }
  $rsa = [Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
  if ($null -eq $rsa -or $rsa.KeySize -lt 3072) { throw 'RSA-3072 or stronger required' }
  $payload = [IO.File]::ReadAllBytes($file.FullName)
  if ($payload.Length -lt 1 -or $payload.Length -gt 16MB) { throw 'Invalid payload size' }
  $hash = [Security.Cryptography.SHA256]::Create()
  try { $digest = ([BitConverter]::ToString($hash.ComputeHash($payload))).Replace('-', '').ToLowerInvariant() } finally { $hash.Dispose() }
  $manifest = [ordered]@{ format='glab-library-v1'; id=$Id; version=$Version; filename=$file.Name; bytes=$payload.Length; sha256=$digest; platform=$Platform; kind=$Kind }
  $utf8 = [Text.UTF8Encoding]::new($false)
  $signed = $utf8.GetBytes(($manifest | ConvertTo-Json -Compress))
  $signature = $rsa.SignData($signed, [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $release = @{ manifest=[Convert]::ToBase64String($signed); signature=[Convert]::ToBase64String($signature); certificate=[Convert]::ToBase64String($cert.RawData); payload=[Convert]::ToBase64String($payload) }
  $encoded = $utf8.GetBytes(($release | ConvertTo-Json -Compress))
  $stream = [IO.File]::Open([IO.Path]::GetFullPath($OutputPath), [IO.FileMode]::CreateNew)
  try { $stream.Write($encoded, 0, $encoded.Length) } finally { $stream.Dispose() }
  [pscustomobject]@{ id=$Id; version=$Version; sha256=$digest; bytes=$payload.Length; output=[IO.Path]::GetFullPath($OutputPath) } | ConvertTo-Json
} finally { if ($rsa) { $rsa.Dispose() }; $cert.Dispose() }
