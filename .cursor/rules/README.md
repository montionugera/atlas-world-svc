# Atlas World - Cursor Rules

This directory contains Cursor rules for the Atlas World Colyseus multiplayer game project. These rules help maintain consistency and provide guidance for development.

## Rule Files

### `colyseus-server.mdc`
Core development rules for Colyseus server development:
- Room-based architecture patterns
- Schema design and state management
- WebSocket communication
- Performance optimization
- Real-time game development

### `react-client.mdc`
React TypeScript client development for Colyseus:
- WebSocket client patterns
- Real-time state synchronization
- Game canvas rendering
- Performance optimization
- Colyseus integration patterns

### `testing.mdc`
Comprehensive testing guidelines:
- Test structure and categories
- Unit tests vs integration tests
- Test setup requirements
- Common test patterns
- Debugging and troubleshooting

### `docker-compose.mdc`
Docker Compose service management:
- Colyseus server containerization
- Port mappings and environment variables
- Health checks and monitoring
- Development workflow
- Production deployment

### `typescript.mdc`
TypeScript development for Colyseus:
- Compilation target and configuration
- Colyseus Schema patterns
- Type definitions and naming conventions
- Common patterns and best practices
- Build process and common issues

### `05-entity-lifecycle.mdc`
Entity lifecycle and state management:
- Death handling patterns (always use `die()` method)
- Counting semantics (total vs alive counts)
- State vs lifecycle distinction
- Cleanup and removal patterns
- Common mistakes and anti-patterns

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
# All tests
pnpm test

# RPC integration tests
pnpm run test:integration:rpc

# WebSocket integration tests
pnpm run test:integration:websocket
```

### Common Commands
```bash
# Check server status
docker-compose ps

# View server logs
docker-compose logs atlas-server

# Restart server
docker-compose restart atlas-server

# Stop all services
docker-compose down

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
- **Colyseus Server**: `ws://localhost:2567`
- **React Client**: `http://localhost:3001`

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