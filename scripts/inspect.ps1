Add-Type -AssemblyName System.IO.Compression.FileSystem

function Inspect-Subfeeder($filePath) {
    Write-Host "Inspecting: $filePath"
    $zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $filePath))
    
    $strings = @()
    $ssEntry = $zip.GetEntry('xl/sharedStrings.xml')
    if ($ssEntry) {
        $stream = $ssEntry.Open()
        $reader = New-Object System.IO.StreamReader($stream)
        $ssXml = [xml]$reader.ReadToEnd()
        $reader.Close()
        $stream.Close()
        foreach ($si in $ssXml.sst.si) {
            $str = ""
            if ($si.t) { $str = $si.t }
            elseif ($si.r) {
                foreach ($rPart in $si.r) { $str += $rPart.t }
            }
            $strings += $str
        }
    }
    
    # Check sheet 4 (BoQ NRO All Feeder)
    $sEntry = $zip.GetEntry("xl/worksheets/sheet4.xml")
    if ($sEntry) {
        $stream = $sEntry.Open()
        $reader = New-Object System.IO.StreamReader($stream)
        $sXml = [xml]$reader.ReadToEnd()
        $reader.Close()
        $stream.Close()
        
        Write-Host "Rows from sheet4 (All Feeder):"
        $rowCount = 0
        foreach ($row in $sXml.worksheet.sheetData.row) {
            $rowVals = @()
            foreach ($c in $row.c) {
                $val = $c.v
                if ($c.t -eq 's' -and $val -ne $null) {
                    $val = $strings[[int]$val]
                }
                $rowVals += "$($c.r): $val"
            }
            if ($rowVals.Count -gt 0) {
                Write-Host ("Row " + $row.r + " -> " + ($rowVals -join " | "))
                $rowCount++
            }
            if ($rowCount -ge 30) { break }
        }
    }
    $zip.Dispose()
}

Inspect-Subfeeder "BLA000190 SF-KELURAHAN NGRAHO BLORA_BOQ_APD(SUBFEEDER).xlsx"
