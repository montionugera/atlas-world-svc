use bevy_ecs::prelude::*;

#[derive(Clone, Copy, Debug)]
pub struct CompactEntry {
    pub entity: Entity,
    pub x: f32,
    pub y: f32,
}

impl Default for CompactEntry {
    fn default() -> Self {
        Self {
            entity: Entity::PLACEHOLDER,
            x: 0.0,
            y: 0.0,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct LayerGrid {
    pub cell_starts: Vec<u32>,
    pub cell_counts: Vec<u32>,
    pub entries: Vec<CompactEntry>,
    raw_buffer: Vec<(Entity, f32, f32, u32)>,
    cursors: Vec<u32>,
}

impl LayerGrid {
    pub fn new(num_cells: usize) -> Self {
        Self {
            cell_starts: vec![0; num_cells + 1],
            cell_counts: vec![0; num_cells],
            cursors: vec![0; num_cells],
            entries: Vec::with_capacity(512),
            raw_buffer: Vec::with_capacity(512),
        }
    }

    #[inline(always)]
    pub fn clear(&mut self) {
        self.cell_counts.fill(0);
        self.raw_buffer.clear();
    }

    #[inline(always)]
    pub fn insert(&mut self, entity: Entity, x: f32, y: f32, cell_idx: usize) {
        self.cell_counts[cell_idx] += 1;
        self.raw_buffer.push((entity, x, y, cell_idx as u32));
    }

    #[inline(always)]
    pub fn finish_build(&mut self, num_cells: usize) {
        if self.cell_starts.len() != num_cells + 1 {
            self.cell_starts.resize(num_cells + 1, 0);
        }
        if self.cursors.len() != num_cells {
            self.cursors.resize(num_cells, 0);
        }

        let mut sum = 0u32;
        for i in 0..num_cells {
            self.cell_starts[i] = sum;
            self.cursors[i] = sum;
            sum += self.cell_counts[i];
        }
        self.cell_starts[num_cells] = sum;

        let total = self.raw_buffer.len();
        if self.entries.len() < total {
            self.entries.resize(total, CompactEntry::default());
        }

        for &(entity, x, y, cell_idx) in &self.raw_buffer {
            let pos = self.cursors[cell_idx as usize] as usize;
            self.cursors[cell_idx as usize] += 1;
            self.entries[pos] = CompactEntry { entity, x, y };
        }
    }

    #[allow(clippy::too_many_arguments)]
    #[inline(always)]
    pub fn for_each_in_cell_range<F>(
        &self,
        center_x: f32,
        center_y: f32,
        radius_sq: f32,
        min_c: usize,
        max_c: usize,
        min_r: usize,
        max_r: usize,
        cols: usize,
        mut f: F,
    ) where
        F: FnMut(Entity, f32, f32, f32),
    {
        for r in min_r..=max_r {
            let row_offset = r * cols;
            for c in min_c..=max_c {
                let cell_idx = row_offset + c;
                let start = self.cell_starts[cell_idx] as usize;
                let end = self.cell_starts[cell_idx + 1] as usize;
                for entry in &self.entries[start..end] {
                    let dx = center_x - entry.x;
                    let dy = center_y - entry.y;
                    let dist_sq = dx * dx + dy * dy;
                    if dist_sq <= radius_sq {
                        f(entry.entity, dx, dy, dist_sq);
                    }
                }
            }
        }
    }
}

#[derive(Debug, Clone, Resource)]
pub struct SpatialGrid {
    pub cell_size: f32,
    pub width: f32,
    pub height: f32,
    pub cols: usize,
    pub rows: usize,
    pub players: LayerGrid,
    pub mobs: LayerGrid,
}

impl Default for SpatialGrid {
    fn default() -> Self {
        Self::new(25.0)
    }
}

impl SpatialGrid {
    pub fn new(cell_size: f32) -> Self {
        Self::new_with_bounds(cell_size, 2000.0, 2000.0)
    }

    pub fn new_with_bounds(cell_size: f32, width: f32, height: f32) -> Self {
        let cols = (width / cell_size).ceil().max(1.0) as usize;
        let rows = (height / cell_size).ceil().max(1.0) as usize;
        let num_cells = cols * rows;
        Self {
            cell_size,
            width,
            height,
            cols,
            rows,
            players: LayerGrid::new(num_cells),
            mobs: LayerGrid::new(num_cells),
        }
    }

    #[inline(always)]
    pub fn clear(&mut self) {
        self.players.clear();
        self.mobs.clear();
    }

    #[inline(always)]
    pub fn cell_coords(&self, x: f32, y: f32) -> (usize, usize) {
        let c = ((x / self.cell_size).floor() as isize).clamp(0, (self.cols - 1) as isize) as usize;
        let r = ((y / self.cell_size).floor() as isize).clamp(0, (self.rows - 1) as isize) as usize;
        (c, r)
    }

    #[inline(always)]
    pub fn insert(&mut self, entity: Entity, x: f32, y: f32, is_player: bool) {
        let (c, r) = self.cell_coords(x, y);
        let idx = r * self.cols + c;
        if is_player {
            self.players.insert(entity, x, y, idx);
        } else {
            self.mobs.insert(entity, x, y, idx);
        }
    }

    #[inline(always)]
    pub fn finish_build(&mut self) {
        let num_cells = self.cols * self.rows;
        self.players.finish_build(num_cells);
        self.mobs.finish_build(num_cells);
    }

    #[inline(always)]
    pub fn for_each_player_in_radius<F>(&self, center_x: f32, center_y: f32, radius: f32, f: F)
    where
        F: FnMut(Entity, f32, f32, f32),
    {
        let radius_sq = radius * radius;
        let (min_c, min_r) = self.cell_coords(center_x - radius, center_y - radius);
        let (max_c, max_r) = self.cell_coords(center_x + radius, center_y + radius);
        self.players.for_each_in_cell_range(
            center_x, center_y, radius_sq, min_c, max_c, min_r, max_r, self.cols, f,
        );
    }

    #[inline(always)]
    pub fn for_each_mob_in_radius<F>(&self, center_x: f32, center_y: f32, radius: f32, f: F)
    where
        F: FnMut(Entity, f32, f32, f32),
    {
        let radius_sq = radius * radius;
        let (min_c, min_r) = self.cell_coords(center_x - radius, center_y - radius);
        let (max_c, max_r) = self.cell_coords(center_x + radius, center_y + radius);
        self.mobs.for_each_in_cell_range(
            center_x, center_y, radius_sq, min_c, max_c, min_r, max_r, self.cols, f,
        );
    }

    #[inline(always)]
    pub fn for_each_in_radius<F>(&self, center_x: f32, center_y: f32, radius: f32, mut f: F)
    where
        F: FnMut(Entity, f32, f32, bool),
    {
        self.for_each_player_in_radius(center_x, center_y, radius, |e, dx, dy, _| {
            f(e, center_x - dx, center_y - dy, true);
        });
        self.for_each_mob_in_radius(center_x, center_y, radius, |e, dx, dy, _| {
            f(e, center_x - dx, center_y - dy, false);
        });
    }

    pub fn query_radius(
        &self,
        center_x: f32,
        center_y: f32,
        radius: f32,
    ) -> Vec<(Entity, f32, f32)> {
        let mut results = Vec::new();
        self.for_each_in_radius(center_x, center_y, radius, |entity, ex, ey, _| {
            results.push((entity, ex, ey));
        });
        results
    }

    pub fn query_neighbors(
        &self,
        center_x: f32,
        center_y: f32,
        radius: f32,
    ) -> Vec<(Entity, f32, f32)> {
        self.query_radius(center_x, center_y, radius)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spatial_grid_queries() {
        let mut grid = SpatialGrid::new_with_bounds(50.0, 1000.0, 1000.0);
        let e1 = Entity::from_raw(1);
        let e2 = Entity::from_raw(2);
        let e3 = Entity::from_raw(3);

        grid.insert(e1, 10.0, 10.0, true);
        grid.insert(e2, 20.0, 20.0, false);
        grid.insert(e3, 200.0, 200.0, false);
        grid.finish_build();

        let near = grid.query_radius(10.0, 10.0, 20.0);
        assert_eq!(near.len(), 2);
        assert!(near.iter().any(|(e, _, _)| *e == e1));
        assert!(near.iter().any(|(e, _, _)| *e == e2));

        let far = grid.query_radius(200.0, 200.0, 10.0);
        assert_eq!(far.len(), 1);
        assert_eq!(far[0].0, e3);

        grid.clear();
        grid.finish_build();
        assert!(grid.query_radius(10.0, 10.0, 100.0).is_empty());
    }
}
