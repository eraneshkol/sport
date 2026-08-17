$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8321
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$port/"

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
}

while ($listener.IsListening) {
  $context = $listener.GetContext()
  try {
    $request = $context.Request
    $response = $context.Response
    $response.KeepAlive = $false
    $path = $request.Url.LocalPath
    if ($path -eq "/") { $path = "/index.html" }
    $filePath = Join-Path $root ($path.TrimStart("/"))

    if (Test-Path $filePath -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($filePath)
      $contentType = $mime[$ext]
      if (-not $contentType) { $contentType = "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      $response.StatusCode = 200
      $response.ContentType = $contentType
      $response.SendChunked = $false
      $response.ContentLength64 = [int64]$bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
      $response.OutputStream.Flush()
    } else {
      $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
      $response.StatusCode = 404
      $response.SendChunked = $false
      $response.ContentLength64 = [int64]$notFound.Length
      $response.OutputStream.Write($notFound, 0, $notFound.Length)
      $response.OutputStream.Flush()
    }
  } catch {
    Write-Host "Request error: $_"
  } finally {
    $context.Response.Close()
  }
}
