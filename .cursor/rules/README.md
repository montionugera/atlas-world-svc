# Atlas World Server - Cursor Rules

This directory contains Cursor rules for the Atlas World Nakama server project. These rules help maintain consistency and provide guidance for development.

## Rule Files

### `nakama-server.mdc`
Core development rules for Nakama server development:
- Project structure and file organization
- TypeScript development guidelines
- Nakama runtime requirements
- Docker development workflow
- Common issues and solutions

### `react-client.mdc`
React TypeScript client development:
- Modern React patterns and hooks
- TypeScript best practices
- Real-time performance optimization
- UI/UX guidelines
- State management patterns

### `testing.mdc`
Comprehensive testing guidelines:
- Test structure and categories
- Unit tests vs integration tests
- Test setup requirements
- Common test patterns
- Debugging and troubleshooting

### `docker-compose.mdc`
Docker Compose service management:
- Service architecture and dependencies
- Database configuration (CockroachDB)
- Port mappings and environment variables
- Troubleshooting common issues
- Development workflow

### `typescript.mdc`
TypeScript development for Nakama:
- Compilation target and configuration
- Global function requirements
- Type definitions and naming conventions
- Common patterns and best practices
- Build process and common issues

## Quick Reference

### Start Development
```bash
# Start all services
docker-compose up -d

# Wait for startup
sleep 10

# Check status
docker-compose ps

# View logs
docker-compose logs atlas-server
```

### Build and Deploy
```bash
# Build TypeScript server
cd modules/ts && pnpm run build

# Restart server
cd ../.. && docker-compose restart atlas-server

# Start React client
cd client/react-client && npm start
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
- Docker Compose infrastructure
- TypeScript build process
- RPC-based match simulation
- React TypeScript client
- Real-time mob movement (20 updates/sec)
- Performance metrics (FPS, update rate)
- State persistence
- Unit tests
- Integration tests

### 🚧 In Progress
- WebSocket-based real-time updates
- Advanced match features

### 📋 Next Steps
- Implement WebSocket match handlers
- Add real-time WebSocket updates
- Enhanced match features
- Multiplayer optimizations

## Architecture

### Server (Nakama)
- **Location**: `modules/ts/`
- **Language**: TypeScript
- **Runtime**: Nakama JavaScript runtime
- **Features**: RPC-based match simulation, state persistence
- **Performance**: 20 updates/second, ultra-fast mob movement

### Client (React)
- **Location**: `client/react-client/`
- **Language**: TypeScript + React
- **Features**: Real-time visualization, performance metrics, responsive UI
- **Performance**: 60fps rendering, smooth interpolation

### Monitoring
- **Grafana**: `http://localhost:3000`
- **Prometheus**: `http://localhost:9091`

## Development Tips

1. **Always edit `src/` files**, never `build/` files
2. **Use `pnpm run build`** to compile TypeScript server
3. **Use `npm start`** for React client development
4. **Check server logs** when things don't work
5. **Test frequently** during development
6. **Use descriptive names** for functions and variables
7. **Handle errors gracefully** in match handlers
8. **Keep functions simple** and focused
9. **Document complex logic** with comments
10. **Optimize for performance** - 20 updates/sec target

## Troubleshooting

### Server Won't Start
1. Check `docker-compose logs atlas-server`
2. Verify `modules/ts/build/index.js` exists
3. Run `pnpm run build` to compile
4. Check for TypeScript errors

### React Client Issues
1. Ensure server is running (`docker-compose ps`)
2. Check `npm start` output for errors
3. Verify connection to localhost:7350
4. Check browser console for errors

### Tests Fail
1. Ensure server is running (`docker-compose ps`)
2. Check server logs for errors
3. Verify test data and expectations
4. Use appropriate timeouts

### Performance Issues
1. Check update rate in React client stats
2. Verify server is processing 20 updates/sec
3. Check FPS in client (should be ~60fps)
4. Monitor server logs for bottlenecks

## Contributing

When making changes:
1. Follow the established patterns
2. Update tests as needed
3. Check that all tests pass
4. Update documentation if necessary
5. Test with both RPC and React client
6. Maintain 20 updates/sec performance target
7. Ensure 60fps client rendering