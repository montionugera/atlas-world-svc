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
# Build TypeScript
cd modules/ts && pnpm run build

# Restart server
cd ../.. && docker-compose restart atlas-server
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
```

## Project Status

### ✅ Working
- Docker Compose infrastructure
- TypeScript build process
- RPC functionality
- WebSocket connections
- Unit tests
- Integration tests

### 🚧 In Progress
- WebSocket match handlers
- Real-time mob movement
- WebSocket message processing

### 📋 Next Steps
- Implement basic match handlers
- Add WebSocket message processing
- Complete real-time functionality
- Add comprehensive error handling

## Development Tips

1. **Always edit `src/` files**, never `build/` files
2. **Use `pnpm run build`** to compile TypeScript
3. **Check server logs** when things don't work
4. **Test frequently** during development
5. **Use descriptive names** for functions and variables
6. **Handle errors gracefully** in match handlers
7. **Keep functions simple** and focused
8. **Document complex logic** with comments

## Troubleshooting

### Server Won't Start
1. Check `docker-compose logs atlas-server`
2. Verify `modules/ts/build/index.js` exists
3. Run `pnpm run build` to compile
4. Check for TypeScript errors

### Tests Fail
1. Ensure server is running (`docker-compose ps`)
2. Check server logs for errors
3. Verify test data and expectations
4. Use appropriate timeouts

### WebSocket Issues
1. Check WebSocket connection works
2. Verify match handlers are implemented
3. Check message format and opcodes
4. Review server logs for errors

## Contributing

When making changes:
1. Follow the established patterns
2. Update tests as needed
3. Check that all tests pass
4. Update documentation if necessary
5. Test with both RPC and WebSocket functionality
