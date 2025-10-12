import { 
  snapToGrid, 
  getGridCell, 
  worldToGrid, 
  gridToWorld, 
  isOnGridLine 
} from '../gridUtils';
import { GRID_CONFIG } from '../../config/gameConfig';

describe('Grid Utils', () => {
  describe('snapToGrid', () => {
    test('should snap to nearest grid point', () => {
      expect(snapToGrid(5)).toBe(10); // 5 rounds to 10
      expect(snapToGrid(7)).toBe(10); // 7 rounds to 10
      expect(snapToGrid(12)).toBe(10); // 12 rounds to 10
      expect(snapToGrid(15)).toBe(20); // 15 rounds to 20
      expect(snapToGrid(0)).toBe(0); // 0 stays 0
      expect(snapToGrid(10)).toBe(10); // 10 stays 10
    });

    test('should work with custom grid size', () => {
      expect(snapToGrid(5, 5)).toBe(5); // 5 with grid size 5
      expect(snapToGrid(7, 5)).toBe(5); // 7 with grid size 5
      expect(snapToGrid(8, 5)).toBe(10); // 8 with grid size 5
    });
  });

  describe('getGridCell', () => {
    test('should return correct grid cell coordinates', () => {
      expect(getGridCell(0, 0)).toEqual({ cellX: 0, cellY: 0 });
      expect(getGridCell(5, 5)).toEqual({ cellX: 0, cellY: 0 });
      expect(getGridCell(10, 10)).toEqual({ cellX: 1, cellY: 1 });
      expect(getGridCell(15, 25)).toEqual({ cellX: 1, cellY: 2 });
      expect(getGridCell(50, 50)).toEqual({ cellX: 5, cellY: 5 });
    });

    test('should work with custom grid size', () => {
      expect(getGridCell(0, 0, 5)).toEqual({ cellX: 0, cellY: 0 });
      expect(getGridCell(5, 5, 5)).toEqual({ cellX: 1, cellY: 1 });
      expect(getGridCell(12, 12, 5)).toEqual({ cellX: 2, cellY: 2 });
    });
  });

  describe('worldToGrid', () => {
    test('should convert world coordinates to grid coordinates', () => {
      expect(worldToGrid(0, 0)).toEqual({ gridX: 0, gridY: 0 });
      expect(worldToGrid(5, 5)).toEqual({ gridX: 0, gridY: 0 });
      expect(worldToGrid(10, 10)).toEqual({ gridX: 1, gridY: 1 });
      expect(worldToGrid(25, 35)).toEqual({ gridX: 2, gridY: 3 });
      expect(worldToGrid(50, 50)).toEqual({ gridX: 5, gridY: 5 });
    });

    test('should work with custom grid size', () => {
      expect(worldToGrid(0, 0, 5)).toEqual({ gridX: 0, gridY: 0 });
      expect(worldToGrid(5, 5, 5)).toEqual({ gridX: 1, gridY: 1 });
      expect(worldToGrid(12, 12, 5)).toEqual({ gridX: 2, gridY: 2 });
    });
  });

  describe('gridToWorld', () => {
    test('should convert grid coordinates to world coordinates', () => {
      expect(gridToWorld(0, 0)).toEqual({ x: 0, y: 0 });
      expect(gridToWorld(1, 1)).toEqual({ x: 10, y: 10 });
      expect(gridToWorld(2, 3)).toEqual({ x: 20, y: 30 });
      expect(gridToWorld(5, 5)).toEqual({ x: 50, y: 50 });
    });

    test('should work with custom grid size', () => {
      expect(gridToWorld(0, 0, 5)).toEqual({ x: 0, y: 0 });
      expect(gridToWorld(1, 1, 5)).toEqual({ x: 5, y: 5 });
      expect(gridToWorld(2, 3, 5)).toEqual({ x: 10, y: 15 });
    });
  });

  describe('isOnGridLine', () => {
    test('should detect positions on grid lines', () => {
      expect(isOnGridLine(0, 0)).toBe(true); // Origin
      expect(isOnGridLine(10, 0)).toBe(true); // X grid line
      expect(isOnGridLine(0, 10)).toBe(true); // Y grid line
      expect(isOnGridLine(10, 10)).toBe(true); // Both grid lines
      expect(isOnGridLine(20, 30)).toBe(true); // Both grid lines
    });

    test('should detect positions not on grid lines', () => {
      expect(isOnGridLine(5, 5)).toBe(false); // Not on grid
      expect(isOnGridLine(15, 25)).toBe(false); // Not on grid
      expect(isOnGridLine(1, 1)).toBe(false); // Not on grid
    });

    test('should work with custom grid size', () => {
      expect(isOnGridLine(0, 0, 5)).toBe(true);
      expect(isOnGridLine(5, 5, 5)).toBe(true);
      expect(isOnGridLine(10, 10, 5)).toBe(true);
      expect(isOnGridLine(3, 3, 5)).toBe(false);
    });
  });

  describe('Grid Configuration', () => {
    test('should have correct default grid size', () => {
      expect(GRID_CONFIG.size).toBe(10);
    });

    test('should have grid enabled by default', () => {
      expect(GRID_CONFIG.enabled).toBe(true);
    });

    test('should have coordinate display enabled', () => {
      expect(GRID_CONFIG.showCoordinates).toBe(true);
    });
  });

  describe('Grid Math', () => {
    test('should handle edge cases', () => {
      // Negative coordinates
      expect(snapToGrid(-5)).toBeCloseTo(0); // -5 rounds to 0 (nearest grid point)
      expect(getGridCell(-5, -5)).toEqual({ cellX: -1, cellY: -1 });
      
      // Large coordinates
      expect(snapToGrid(150)).toBe(150);
      expect(getGridCell(150, 150)).toEqual({ cellX: 15, cellY: 15 });
      
      // Decimal coordinates
      expect(snapToGrid(5.5)).toBe(10);
      expect(getGridCell(5.5, 5.5)).toEqual({ cellX: 0, cellY: 0 });
    });

    test('should maintain grid consistency', () => {
      // Test round-trip conversion
      const worldPos = { x: 25, y: 35 };
      const gridPos = worldToGrid(worldPos.x, worldPos.y);
      const backToWorld = gridToWorld(gridPos.gridX, gridPos.gridY);
      
      expect(backToWorld.x).toBe(20); // 2 * 10 = 20
      expect(backToWorld.y).toBe(30); // 3 * 10 = 30
    });
  });
});
