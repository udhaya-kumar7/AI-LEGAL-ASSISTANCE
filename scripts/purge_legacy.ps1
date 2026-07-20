# Permanently delete legacy calendar/event files
# WARNING: This will permanently remove files listed below.
# Run from the repo root (PowerShell):
#   cd 'C:\Users\udhay\Desktop\Luma_clone - Copy (2)'
#   .\scripts\purge_legacy.ps1

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

foreach ($f in $files) {
  if (Test-Path $f) {
    try {
      Remove-Item -Path $f -Force -ErrorAction Stop
      Write-Host "Deleted: $f"
    } catch {
      Write-Host "Failed to delete: $f -> $_"
    }
  } else {
    Write-Host "Not found (skipped): $f"
  }
}

Write-Host "Purge complete."