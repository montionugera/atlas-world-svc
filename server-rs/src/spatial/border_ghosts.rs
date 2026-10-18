use crate::content::world_model::{BORDER_GHOST_BAND_UNITS, REGION_SIZE_UNITS};
use crate::protocol::{EntitySnapshotData, EntityType, STATE_FLAG_ALIVE};
use std::collections::HashMap;

/// Cardinal border direction relative to a local region (`E-004` Slice 9).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum CardinalBorder {
    /// Shared border at `y = 0.0` (neighbor sits at `y in [-H, 0.0]`).
    North,
    /// Shared border at `y = H` (neighbor sits at `y in [H, 2H]`).
    South,
    /// Shared border at `x = W` (neighbor sits at `x in [W, 2W]`).
    East,
    /// Shared border at `x = 0.0` (neighbor sits at `x in [-W, 0.0]`).
    West,
}

impl CardinalBorder {
    /// Returns the opposite cardinal border from the neighbor's perspective.
    pub const fn opposite(self) -> Self {
        match self {
            Self::North => Self::South,
            Self::South => Self::North,
            Self::East => Self::West,
            Self::West => Self::East,
        }
    }

    pub const ALL: [Self; 4] = [Self::North, Self::South, Self::East, Self::West];
}

/// Bidirectional cardinal adjacency graph between regions (`4000 × 4000` world tiles).
#[derive(Debug, Clone, Default)]
pub struct RegionAdjacencyGraph {
    neighbors: HashMap<String, HashMap<CardinalBorder, String>>,
}

impl RegionAdjacencyGraph {
    pub fn new() -> Self {
        Self::default()
    }

    /// Connects `region_a` and `region_b` across `border_from_a` (and registers the inverse on `region_b`).
    pub fn connect(&mut self, region_a: &str, border_from_a: CardinalBorder, region_b: &str) {
        self.neighbors
            .entry(region_a.to_string())
            .or_default()
            .insert(border_from_a, region_b.to_string());
        self.neighbors
            .entry(region_b.to_string())
            .or_default()
            .insert(border_from_a.opposite(), region_a.to_string());
    }

    /// Returns the adjacent region ID across `border` from `region_id`, if any.
    pub fn neighbor(&self, region_id: &str, border: CardinalBorder) -> Option<&str> {
        self.neighbors
            .get(region_id)
            .and_then(|m| m.get(&border))
            .map(|s| s.as_str())
    }

    /// Returns all `(CardinalBorder, neighbor_region_id)` pairs for `region_id`.
    pub fn neighbors_of(&self, region_id: &str) -> Option<&HashMap<CardinalBorder, String>> {
        self.neighbors.get(region_id)
    }

    /// Canonical 3×3 Wealdmarch open-world region grid (`E-004`):
    ///
    /// - North row:  `northern-icefield` (W) — `hollowmarch` (C)    — `gildmark-head` (E)
    /// - Center row: `thornveil` (W)         — `millcross-ford` (C) — `ashvale-front` (E)
    /// - South row:  `rooktide-reach` (W)    — `cindervast` (C)     — `emberdown` (E)
    pub fn wealdmarch_default() -> Self {
        let mut graph = Self::new();
        let grid = [
            ["northern-icefield", "hollowmarch", "gildmark-head"],
            ["thornveil", "millcross-ford", "ashvale-front"],
            ["rooktide-reach", "cindervast", "emberdown"],
        ];
        for r in 0..3 {
            for c in 0..3 {
                if c + 1 < 3 {
                    graph.connect(grid[r][c], CardinalBorder::East, grid[r][c + 1]);
                }
                if r + 1 < 3 {
                    graph.connect(grid[r][c], CardinalBorder::South, grid[r + 1][c]);
                }
            }
        }
        graph
    }
}

/// Extracts alive players and mobs from a neighbor region's snapshot that lie within `band_units`
/// (`250.0` by default) of the shared border and projects their positions into the local region's
/// coordinate space (`E-004` Slice 9).
///
/// Projected coordinates lie just outside `[0..region_width, 0..region_height]`:
/// - `North` neighbor (`y in [H - band, H]`): `y_local = y - H` (`[-band, 0]`)
/// - `South` neighbor (`y in [0, band]`):     `y_local = y + H` (`[H, H + band]`)
/// - `West` neighbor  (`x in [W - band, W]`): `x_local = x - W` (`[-band, 0]`)
/// - `East` neighbor  (`x in [0, band]`):     `x_local = x + W` (`[W, W + band]`)
pub fn extract_border_ghosts(
    neighbor_entities: &[EntitySnapshotData],
    border_from_local: CardinalBorder,
    region_width: f32,
    region_height: f32,
    band_units: f32,
) -> Vec<EntitySnapshotData> {
    let band = band_units.max(0.0);
    let mut ghosts = Vec::new();

    for entity in neighbor_entities {
        // Replicate alive players and mobs across the border (projectiles remain region-local).
        if entity.entity_type != EntityType::Player && entity.entity_type != EntityType::Mob {
            continue;
        }
        if (entity.state_flags & STATE_FLAG_ALIVE) == 0 {
            continue;
        }

        let (in_band, proj_x, proj_y) = match border_from_local {
            CardinalBorder::North => (
                entity.y >= (region_height - band) && entity.y <= region_height,
                entity.x,
                entity.y - region_height,
            ),
            CardinalBorder::South => (
                entity.y >= 0.0 && entity.y <= band,
                entity.x,
                entity.y + region_height,
            ),
            CardinalBorder::West => (
                entity.x >= (region_width - band) && entity.x <= region_width,
                entity.x - region_width,
                entity.y,
            ),
            CardinalBorder::East => (
                entity.x >= 0.0 && entity.x <= band,
                entity.x + region_width,
                entity.y,
            ),
        };

        if in_band {
            let mut ghost = *entity;
            ghost.x = proj_x;
            ghost.y = proj_y;
            ghost.input_ack = 0;
            ghosts.push(ghost);
        }
    }

    ghosts
}

/// Collects border ghosts for `local_region_id` from all connected cardinal neighbors in `adjacency`
/// using the canonical `REGION_SIZE_UNITS` (`4000.0`) and `BORDER_GHOST_BAND_UNITS` (`250.0`).
pub fn collect_region_border_ghosts(
    local_region_id: &str,
    adjacency: &RegionAdjacencyGraph,
    region_snapshots: &HashMap<String, Vec<EntitySnapshotData>>,
) -> Vec<EntitySnapshotData> {
    let Some(neighbors) = adjacency.neighbors_of(local_region_id) else {
        return Vec::new();
    };
    let mut all_ghosts = Vec::new();
    for &border in &CardinalBorder::ALL {
        if let Some(neighbor_id) = neighbors.get(&border) {
            if let Some(neighbor_entities) = region_snapshots.get(neighbor_id) {
                let mut border_ghosts = extract_border_ghosts(
                    neighbor_entities,
                    border,
                    REGION_SIZE_UNITS,
                    REGION_SIZE_UNITS,
                    BORDER_GHOST_BAND_UNITS,
                );
                all_ghosts.append(&mut border_ghosts);
            }
        }
    }
    all_ghosts
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_entity(id: u32, entity_type: EntityType, x: f32, y: f32) -> EntitySnapshotData {
        EntitySnapshotData {
            id,
            entity_type,
            x,
            y,
            health: 100.0,
            max_health: 100.0,
            state_flags: STATE_FLAG_ALIVE,
            input_ack: 7,
            ..Default::default()
        }
    }

    #[test]
    fn wealdmarch_default_connects_all_nine_regions_bidirectionally() {
        let graph = RegionAdjacencyGraph::wealdmarch_default();
        assert_eq!(
            graph.neighbor("millcross-ford", CardinalBorder::West),
            Some("thornveil")
        );
        assert_eq!(
            graph.neighbor("thornveil", CardinalBorder::East),
            Some("millcross-ford")
        );
        assert_eq!(
            graph.neighbor("millcross-ford", CardinalBorder::East),
            Some("ashvale-front")
        );
        assert_eq!(
            graph.neighbor("millcross-ford", CardinalBorder::North),
            Some("hollowmarch")
        );
        assert_eq!(
            graph.neighbor("millcross-ford", CardinalBorder::South),
            Some("cindervast")
        );
    }

    #[test]
    fn extract_border_ghosts_projects_coordinates_across_all_four_borders() {
        let east_entities = vec![
            sample_entity(101, EntityType::Player, 120.0, 2000.0), // within 250 of west edge
            sample_entity(102, EntityType::Mob, 300.0, 2000.0),    // outside 250 band
        ];
        let ghosts = extract_border_ghosts(
            &east_entities,
            CardinalBorder::East,
            4000.0,
            4000.0,
            BORDER_GHOST_BAND_UNITS,
        );
        assert_eq!(ghosts.len(), 1);
        assert_eq!(ghosts[0].id, 101);
        assert_eq!(ghosts[0].x, 4120.0);
        assert_eq!(ghosts[0].y, 2000.0);
        assert_eq!(ghosts[0].input_ack, 0);
    }
}
