use bevy_ecs::prelude::*;

#[derive(Debug, Clone, Resource)]
pub struct SimClock {
    pub tick: u32,
    pub elapsed_ms: u64,
    pub tick_step_ms: u64,
}

impl Default for SimClock {
    fn default() -> Self {
        Self {
            tick: 0,
            elapsed_ms: 0,
            tick_step_ms: 50,
        }
    }
}

impl SimClock {
    pub fn new(tick_step_ms: u64) -> Self {
        Self {
            tick: 0,
            elapsed_ms: 0,
            tick_step_ms,
        }
    }

    pub fn now(&self) -> u64 {
        self.elapsed_ms
    }

    pub fn tick(&self) -> u32 {
        self.tick
    }

    pub fn advance(&mut self) {
        self.tick += 1;
        self.elapsed_ms += self.tick_step_ms;
    }

    pub fn advance_by(&mut self, delta_ms: u64) {
        self.elapsed_ms += delta_ms;
    }

    pub fn delta_seconds(&self) -> f32 {
        (self.tick_step_ms as f32) / 1000.0
    }

    pub fn current_time_seconds(&self) -> f32 {
        (self.elapsed_ms as f32) / 1000.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sim_clock() {
        let mut clock = SimClock::default();
        assert_eq!(clock.now(), 0);
        assert_eq!(clock.tick(), 0);
        assert_eq!(clock.delta_seconds(), 0.05);

        clock.advance();
        assert_eq!(clock.now(), 50);
        assert_eq!(clock.tick(), 1);
    }
}
