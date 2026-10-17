use crate::ecs::components::{Health, PlayerTag, Position};
use crate::spatial::grid::SpatialGrid;
use bevy_ecs::prelude::*;

pub fn spatial_grid_rebuild_system(
    mut grid: ResMut<SpatialGrid>,
    query: Query<(Entity, &Position, &Health, Option<&PlayerTag>)>,
) {
    grid.clear();
    for (entity, pos, health, player_tag) in &query {
        if health.is_alive {
            grid.insert(entity, pos.x, pos.y, player_tag.is_some());
        }
    }
    grid.finish_build();
}
