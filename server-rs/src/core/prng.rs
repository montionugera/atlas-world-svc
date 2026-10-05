use bevy_ecs::prelude::*;

#[derive(Debug, Clone, PartialEq, Resource)]
pub struct Mulberry32 {
    pub s: u32,
}

impl Mulberry32 {
    pub fn new(seed: u32) -> Self {
        Self { s: seed }
    }

    pub fn next_f32(&mut self) -> f32 {
        self.s = self.s.wrapping_add(0x6d2b79f5);
        let mut t = self.s;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        ((t ^ (t >> 14)) as f64 / 4294967296.0) as f32
    }

    pub fn range(&mut self, min: f32, max: f32) -> f32 {
        min + self.next_f32() * (max - min)
    }

    pub fn next_u32(&mut self) -> u32 {
        self.s = self.s.wrapping_add(0x6d2b79f5);
        let mut t = self.s;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }
}

/// Numerical Recipes LCG matching seedRandom() in test harness
#[derive(Debug, Clone, PartialEq)]
pub struct Lcg {
    pub s: u32,
}

impl Lcg {
    pub fn new(seed: u32) -> Self {
        Self { s: seed }
    }

    pub fn next_f64(&mut self) -> f64 {
        self.s = (1664525u64
            .wrapping_mul(self.s as u64)
            .wrapping_add(1013904223)) as u32;
        (self.s as f64) / 4294967296.0
    }

    pub fn next_base36_2(&mut self) -> String {
        let val = self.next_f64();
        let n = (val * 36.0 * 36.0).floor() as u32;
        let d1 = (n / 36) % 36;
        let d2 = n % 36;
        fn b36_char(d: u32) -> char {
            if d < 10 {
                (b'0' + d as u8) as char
            } else {
                (b'a' + (d - 10) as u8) as char
            }
        }
        format!("{}{}", b36_char(d1), b36_char(d2))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mulberry32_determinism() {
        let mut prng1 = Mulberry32::new(0x1337c0de);
        let mut prng2 = Mulberry32::new(0x1337c0de);

        for _ in 0..100 {
            assert_eq!(prng1.next_f32(), prng2.next_f32());
        }
    }

    #[test]
    fn test_lcg_base36_parity() {
        let mut lcg = Lcg::new(0x1337c0de);
        assert_eq!(lcg.next_base36_2(), "9e");
        assert_eq!(lcg.next_base36_2(), "4x");
        assert_eq!(lcg.next_base36_2(), "xr");
    }
}
