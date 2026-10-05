use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Element {
    #[default]
    #[serde(alias = "Neutral")]
    Neutral,
    #[serde(alias = "Earth")]
    Earth,
    #[serde(alias = "Water")]
    Water,
    #[serde(alias = "Wind")]
    Wind,
    #[serde(alias = "Fire")]
    Fire,
    #[serde(alias = "Holy")]
    Holy,
    #[serde(alias = "Void")]
    Void,
}

pub const ALL_ELEMENTS: [Element; 7] = [
    Element::Neutral,
    Element::Earth,
    Element::Water,
    Element::Wind,
    Element::Fire,
    Element::Holy,
    Element::Void,
];

impl Element {
    pub fn as_str(&self) -> &'static str {
        match self {
            Element::Neutral => "neutral",
            Element::Earth => "earth",
            Element::Water => "water",
            Element::Wind => "wind",
            Element::Fire => "fire",
            Element::Holy => "holy",
            Element::Void => "void",
        }
    }
}

/// Calculate elemental damage multiplier based on attack and defense elements.
///
/// Rules:
/// - Natural cycle: Water > Fire (2.0), Fire > Earth (2.0), Earth > Wind (2.0), Wind > Water (2.0).
/// - Opposed pair: Holy <-> Void (mutual 2.0).
/// - Neutral: 1.0 against all, all 1.0 against Neutral.
/// - Reverse of cycle and self-vs-self (non-neutral): 0.5.
/// - All other interactions: 1.0.
pub fn get_element_multiplier(attack: Element, defense: Element) -> f32 {
    match (attack, defense) {
        // Neutral has no advantage or disadvantage
        (Element::Neutral, _) | (_, Element::Neutral) => 1.0,

        // Natural cycle: Water > Fire > Earth > Wind > Water (2.0)
        (Element::Water, Element::Fire)
        | (Element::Fire, Element::Earth)
        | (Element::Earth, Element::Wind)
        | (Element::Wind, Element::Water) => 2.0,

        // Opposed pair: Holy <-> Void (mutual 2.0)
        (Element::Holy, Element::Void) | (Element::Void, Element::Holy) => 2.0,

        // Self-vs-self (0.5)
        (Element::Earth, Element::Earth)
        | (Element::Water, Element::Water)
        | (Element::Wind, Element::Wind)
        | (Element::Fire, Element::Fire)
        | (Element::Holy, Element::Holy)
        | (Element::Void, Element::Void) => 0.5,

        // Reverse of cycle (0.5)
        (Element::Fire, Element::Water)
        | (Element::Earth, Element::Fire)
        | (Element::Wind, Element::Earth)
        | (Element::Water, Element::Wind) => 0.5,

        // All other interactions
        _ => 1.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_element_default() {
        assert_eq!(Element::default(), Element::Neutral);
    }

    #[test]
    fn test_natural_cycle_advantage() {
        assert_eq!(get_element_multiplier(Element::Water, Element::Fire), 2.0);
        assert_eq!(get_element_multiplier(Element::Fire, Element::Earth), 2.0);
        assert_eq!(get_element_multiplier(Element::Earth, Element::Wind), 2.0);
        assert_eq!(get_element_multiplier(Element::Wind, Element::Water), 2.0);
    }

    #[test]
    fn test_opposed_pair_advantage() {
        assert_eq!(get_element_multiplier(Element::Holy, Element::Void), 2.0);
        assert_eq!(get_element_multiplier(Element::Void, Element::Holy), 2.0);
    }

    #[test]
    fn test_reverse_cycle_disadvantage() {
        assert_eq!(get_element_multiplier(Element::Fire, Element::Water), 0.5);
        assert_eq!(get_element_multiplier(Element::Earth, Element::Fire), 0.5);
        assert_eq!(get_element_multiplier(Element::Wind, Element::Earth), 0.5);
        assert_eq!(get_element_multiplier(Element::Water, Element::Wind), 0.5);
    }

    #[test]
    fn test_self_vs_self() {
        assert_eq!(get_element_multiplier(Element::Earth, Element::Earth), 0.5);
        assert_eq!(get_element_multiplier(Element::Water, Element::Water), 0.5);
        assert_eq!(get_element_multiplier(Element::Wind, Element::Wind), 0.5);
        assert_eq!(get_element_multiplier(Element::Fire, Element::Fire), 0.5);
        assert_eq!(get_element_multiplier(Element::Holy, Element::Holy), 0.5);
        assert_eq!(get_element_multiplier(Element::Void, Element::Void), 0.5);
        // Neutral vs Neutral is 1.0
        assert_eq!(
            get_element_multiplier(Element::Neutral, Element::Neutral),
            1.0
        );
    }

    #[test]
    fn test_neutral_interactions() {
        for elem in ALL_ELEMENTS {
            assert_eq!(get_element_multiplier(Element::Neutral, elem), 1.0);
            assert_eq!(get_element_multiplier(elem, Element::Neutral), 1.0);
        }
    }

    #[test]
    fn test_full_matrix_verification() {
        // Expected 7x7 matrix matching colyseus-server bit-for-bit
        let expected_matrix: [[f32; 7]; 7] = [
            // Neutral
            [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
            // Earth: N, Earth, Water, Wind, Fire, Holy, Void
            [1.0, 0.5, 1.0, 2.0, 0.5, 1.0, 1.0],
            // Water: N, Earth, Water, Wind, Fire, Holy, Void
            [1.0, 1.0, 0.5, 0.5, 2.0, 1.0, 1.0],
            // Wind: N, Earth, Water, Wind, Fire, Holy, Void
            [1.0, 0.5, 2.0, 0.5, 1.0, 1.0, 1.0],
            // Fire: N, Earth, Water, Wind, Fire, Holy, Void
            [1.0, 2.0, 0.5, 1.0, 0.5, 1.0, 1.0],
            // Holy: N, Earth, Water, Wind, Fire, Holy, Void
            [1.0, 1.0, 1.0, 1.0, 1.0, 0.5, 2.0],
            // Void: N, Earth, Water, Wind, Fire, Holy, Void
            [1.0, 1.0, 1.0, 1.0, 1.0, 2.0, 0.5],
        ];

        for (i, &atk) in ALL_ELEMENTS.iter().enumerate() {
            for (j, &def) in ALL_ELEMENTS.iter().enumerate() {
                let actual = get_element_multiplier(atk, def);
                let expected = expected_matrix[i][j];
                assert_eq!(
                    actual, expected,
                    "Mismatch for attack {:?} vs defense {:?}: got {}, expected {}",
                    atk, def, actual, expected
                );
            }
        }
    }
}
