# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
npm run dev          # Start development server (Next.js with Turbopack)
npm run build        # Production build
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint with auto-fix
npm run check        # ESLint check without fix
npm test             # Run all tests (vitest)
```

Run a single test file:
```bash
npx vitest run __tests__/parsing/linux.test.tsx
```

## Architecture Overview

This is a Next.js application that creates WiFi signal strength and throughput heatmaps. It runs on a laptop, collects measurements at various locations, and overlays results on a floor plan image.

### Key Architectural Layers

**Frontend (React/Next.js)**
- `src/app/page.tsx` - Main App component with `SettingsProvider` wrapping `TabPanel`
- `src/components/TabPanel.tsx` - Contains four tabs: Settings, Floor Plan, Heatmaps, Survey Points
- `src/components/Floorplan.tsx` - Interactive floor plan; clicks trigger measurements
- `src/components/Heatmaps.tsx` - Renders heatmap visualization using WebGL

**API Routes (Server)**
- `src/app/api/start-task/route.ts` - POST to start/stop measurements; GET to poll results
- `src/app/api/events/route.ts` - Server-Sent Events for real-time progress updates
- `src/app/api/media/route.ts` - GET list of floor plans; POST to upload new images

**Platform-Specific WiFi Scanners**
- `src/lib/wifiScanner.ts` - Main entry point, detects OS and delegates
- `src/lib/wifiScanner-macos.ts` - Uses `wdutil`, `ioreg`, `system_profiler`
- `src/lib/wifiScanner-windows.ts` - Uses `netsh wlan` commands
- `src/lib/wifiScanner-linux.ts` - Uses `nmcli`, `iw`

Each platform scanner implements `WifiActions` interface with: `preflightSettings()`, `checkIperfServer()`, `findWifiInterface()`, `scanWifi()`, `getWifi()`

**WebGL Heatmap Rendering** (`src/app/webGL/`)
- Uses Inverse Distance Weighted (IDW) interpolation for smooth gradients
- `renderers/mainRenderer.ts` - Orchestrates rendering pipeline
- `shaders/` - GLSL vertex and fragment shaders
- `textures/createGradientLUTTexture.ts` - Color gradient lookup table

**Utility Modules**
- `src/lib/iperfRunner.ts` - Runs iperf3 TCP/UDP speed tests
- `src/lib/localization.ts` - Windows netsh output localization (reads `data/localization/*.json`)
- `src/lib/radiusCalculations.ts` - Auto-calculates heatmap point radius
- `src/lib/utils.ts` - Includes `rssiToPercentage()` and `percentageToRSSI()` conversions

### Data Flow

1. User clicks floor plan -> POST `/api/start-task?action=start`
2. Server runs platform-specific WiFi scan + optional iperf3 test
3. Client polls GET `/api/start-task?action=results` for completion
4. SSE stream (`/api/events`) provides real-time progress to `NewToast` component
5. Results stored in localStorage per floor plan image

### Testing

Tests are in `__tests__/` directory. Most tests parse sample output from platform-specific commands (macOS wdutil, Windows netsh, Linux nmcli/iw).

## Environment Variables

- `LOG_LEVEL` - Controls logging verbosity (0=silly, 1=trace, 2=debug, 3=info, 4=warn, 5=error, 6=fatal)

Example: `LOG_LEVEL=2 npm run dev`
