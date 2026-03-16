# Atlas World - Cursor Rules

This directory contains Cursor rules for the Atlas World Colyseus multiplayer game project. These rules help maintain consistency and provide guidance for development.

## Rule Files

### Workflow and standards
- **01-development-workflow.mdc** — Branch strategy, commits, PRs, performance, docs, plan management
- **02-coding-standards.mdc** — TypeScript config, naming, error handling, performance
- **03-project-structure.mdc** — Root layout, colyseus-server and react-client organization
- **01-apis-and-constructors.mdc** — Single-path APIs, options objects, no overloads (globs: `*.ts`)
- **02-accuracy-correctness.mdc** — Timing, rendering scale, heading, authority, event bus, tests
- **05-entity-lifecycle.mdc** — Use `die()` and transition methods; total vs active counts (globs: `*.ts`)

### Server and client
- **colyseus-server.mdc** — Room lifecycle, schema design, 20 FPS simulation
- **react-client.mdc** — React + Colyseus client (globs: `client/react-client/**/*.ts(x)`)
- **typescript.mdc** — Colyseus server TypeScript (ES2020, CommonJS, Schema)
- **docker-compose.mdc** — Colyseus service (atlas-colyseus-server, port 2567)

### Testing and QA
- **testing.mdc** — Jest tests in `colyseus-server/src/tests/*.test.ts`, commands
- **04-testing-qa.mdc** — Coverage targets, chaos, monitoring
- **04-csharp-client.mdc** — Unity/C# client (generated/csharp or Unity projects)

### Docs
- Project docs: **docs/README.md** (flow order: event-flow → spawn → player → mob-movement → attack → ai → companion; then api, game-server, networking)

## Quick Reference

### Start Development
```bash
# Start Colyseus server
cd colyseus-server && npm run dev

# Or use Docker
docker-compose up -d atlas-colyseus-server

# Start React client
cd client/react-client && npm start
```

### Build and Deploy
```bash
# Build Colyseus server
cd colyseus-server && npm run build

# Start production server
cd colyseus-server && npm start

# Build React client
cd client/react-client && npm run build
```

### Run Tests
```bash
cd colyseus-server
npm test                  # all Jest tests
npm test -- --runInBand   # single-thread
```

### Common Commands
```bash
# Check server status
docker-compose ps

# View server logs
docker-compose logs atlas-colyseus-server

# Restart server
docker-compose restart atlas-colyseus-server

# Stop all services
docker-compose down

# Run server tests
cd colyseus-server && npm test

# Start React client
cd client/react-client && npm start
```

## Project Status

### ✅ Working
- Colyseus WebSocket server
- Real-time state synchronization
- React TypeScript client
- Live mob simulation (20 FPS)
- Multiplayer support
- Docker containerization
- Performance metrics (FPS, update rate)
- Room-based architecture
- TypeScript build process

### 🚧 In Progress
- Enhanced game features
- Performance optimizations

### 📋 Next Steps
- Player customization
- Multiple game maps
- Advanced mob AI
- Performance monitoring
- Database integration

## Architecture

### Server (Colyseus)
- **Location**: `colyseus-server/`
- **Language**: TypeScript + Node.js
- **Runtime**: Colyseus WebSocket server
- **Features**: Real-time state sync, room management, mob simulation
- **Performance**: 20 FPS simulation, WebSocket communication

### Client (React)
- **Location**: `client/react-client/`
- **Language**: TypeScript + React
- **Features**: Real-time visualization, WebSocket client, game canvas
- **Performance**: 60fps rendering, smooth interpolation

### Services
- **Colyseus Server**: `ws://localhost:2567` (HTTP same port)
- **React Client**: `http://localhost:3000` (or port from react-scripts)

## Development Tips

1. **Always edit `src/` files**, never `dist/` files
2. **Use `npm run build`** to compile TypeScript server
3. **Use `npm start`** for React client development
4. **Check server logs** when things don't work
5. **Test frequently** during development
6. **Use descriptive names** for functions and variables
7. **Handle errors gracefully** in room handlers
8. **Keep functions simple** and focused
9. **Document complex logic** with comments
10. **Optimize for performance** - 20 FPS simulation target

## Troubleshooting

### Server Won't Start
1. Check `npm run dev` output for errors
2. Verify `colyseus-server/dist/index.js` exists
3. Run `npm run build` to compile
4. Check for TypeScript errors

### React Client Issues
1. Ensure Colyseus server is running (port 2567)
2. Check `npm start` output for errors
3. Verify WebSocket connection to ws://localhost:2567
4. Check browser console for errors

### Tests Fail
1. Ensure Colyseus server is running
2. Check server logs for errors
3. Verify test data and expectations
4. Use appropriate timeouts

### Performance Issues
1. Check FPS in React client stats
2. Verify server is processing 20 FPS simulation
3. Check WebSocket connection stability
4. Monitor server logs for bottlenecks

## Maintaining rules
- Keep rules aligned with the codebase (Colyseus server, React client, docs under `docs/`).
- After architecture changes, update 03-project-structure and relevant domain rules.
- Plan cleanup: run `.cursor/scripts/validate-plans.js`, then `.cursor/scripts/cleanup-plans.sh` for finished plans.

## Contributing

When making changes:
1. Follow the established patterns
2. Update tests as needed
3. Check that all tests pass
4. Update documentation if necessary
5. Test with both Colyseus server and React client
6. Maintain 20 FPS simulation performance target
7. Ensure 60fps client rendering
8. Test WebSocket connection stability