param([Parameter(Mandatory=$true)][string]$PublicCertificatePath)
$ErrorActionPreference = 'Stop'
# Run as the designated GLab release-signing account. Private key never leaves CNG.
$outputPath = [IO.Path]::GetFullPath($PublicCertificatePath)
if (Test-Path -LiteralPath $outputPath) { throw 'Refusing to overwrite an existing certificate' }
$cert = New-SelfSignedCertificate -Subject 'CN=GLab Library Publisher' -Type CodeSigningCert `
  -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy NonExportable `
  -Provider 'Microsoft Software Key Storage Provider' -CertStoreLocation 'Cert:\CurrentUser\My' `
  -NotAfter (Get-Date).AddYears(1)
try {
  $stream = [IO.File]::Open($outputPath, [IO.FileMode]::CreateNew)
  try { $stream.Write($cert.RawData, 0, $cert.RawData.Length) } finally { $stream.Dispose() }
  $hash = [Security.Cryptography.SHA256]::Create()
  try { $pin = ([BitConverter]::ToString($hash.ComputeHash($cert.RawData))).Replace('-', '').ToLowerInvariant() } finally { $hash.Dispose() }
  [pscustomobject]@{ signingCertificateThumbprint=$cert.Thumbprint; publicCertificate=$outputPath; sha256=$pin } | ConvertTo-Json
} finally { $cert.Dispose() }
