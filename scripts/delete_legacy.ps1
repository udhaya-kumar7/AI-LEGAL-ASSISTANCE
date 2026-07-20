# Archive legacy calendar/event files into archive\legacy
# Run this from the repo root (PowerShell):
#   cd 'C:\Users\udhay\Desktop\Luma_clone - Copy (2)'
#   .\scripts\delete_legacy.ps1

$files = @(
  'backend/controllers/eventController.js',
  'backend/controllers/calendarController.js',
  'backend/models/Event.js',
  'backend/models/Calendar.js',
  'backend/models/Subscription.js',
  'backend/routes/eventRoutes.js',
  'backend/routes/calendarRoutes.js',
  'backend/routes/userRoutes.js',
  'backend/utils/sendEmail.js',
  'backend/Seed.js',

  'frontend/src/pages/Calendar_temp.jsx',
  'frontend/src/pages/CalendarsPage.jsx',
  'frontend/src/pages/CalendarsCreate.jsx',
  'frontend/src/pages/CalendarDetail.jsx',
  'frontend/src/pages/Calendar.jsx',
  'frontend/src/pages/Events.jsx',
  'frontend/src/pages/Discover.jsx',
  'frontend/src/components/CalendarCard.jsx',
  'frontend/src/components/CalendarSection.jsx',
  'frontend/src/components/EventCard.jsx'
)

$archiveRoot = 'archive\legacy'
if (-not (Test-Path $archiveRoot)) {
  New-Item -ItemType Directory -Path $archiveRoot -Force | Out-Null
}

foreach ($f in $files) {
  if (Test-Path $f) {
    $leaf = Split-Path $f -Leaf
    $subdir = Split-Path $f -Parent -Resolve
    $subdirName = ($subdir -replace "[\\/]", "_")
    $destDir = Join-Path $archiveRoot $subdirName
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    $dest = Join-Path $destDir $leaf
    Move-Item -Path $f -Destination $dest -Force
    Write-Host "Moved: $f -> $dest"
  } else {
    Write-Host "Not found (skipped): $f"
  }
}

Write-Host "Archive complete. Check the 'archive\legacy' folder."